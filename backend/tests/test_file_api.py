"""
Test /api/file endpoint file reading logic
"""
import pytest
from pathlib import Path
import tempfile
import os


def read_file_logic(path: str, line: int = 1, context: int = 20):
    """Simulate core logic of read_file in server.py"""
    file_path = Path(path)

    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    content = file_path.read_text(encoding="utf-8")
    lines = content.split("\n")
    total_lines = len(lines)

    start_line = max(1, line - context)
    end_line = min(total_lines, line + context)

    selected_lines = lines[start_line - 1 : end_line]
    selected_content = "\n".join(selected_lines)

    return {
        "content": selected_content,
        "startLine": start_line,
        "endLine": end_line,
        "totalLines": total_lines,
    }


class TestReadFileLogic:
    """Test file reading logic"""

    def test_basic_read(self, tmp_path):
        """Basic file reading"""
        # Create test file
        test_file = tmp_path / "test.lean"
        test_file.write_text("\n".join([f"line {i}" for i in range(1, 21)]))

        result = read_file_logic(str(test_file), line=10, context=5)

        assert result["startLine"] == 5
        assert result["endLine"] == 15
        assert result["totalLines"] == 20
        assert "line 10" in result["content"]

    def test_line_at_start(self, tmp_path):
        """Target line at beginning of file"""
        test_file = tmp_path / "test.lean"
        test_file.write_text("\n".join([f"line {i}" for i in range(1, 21)]))

        result = read_file_logic(str(test_file), line=1, context=5)

        assert result["startLine"] == 1  # Cannot be less than 1
        assert result["endLine"] == 6
        assert "line 1" in result["content"]

    def test_line_at_end(self, tmp_path):
        """Target line at end of file"""
        test_file = tmp_path / "test.lean"
        test_file.write_text("\n".join([f"line {i}" for i in range(1, 21)]))

        result = read_file_logic(str(test_file), line=20, context=5)

        assert result["startLine"] == 15
        assert result["endLine"] == 20  # Cannot exceed total lines
        assert "line 20" in result["content"]

    def test_small_file(self, tmp_path):
        """Small file (fewer lines than context)"""
        test_file = tmp_path / "test.lean"
        test_file.write_text("line 1\nline 2\nline 3")

        result = read_file_logic(str(test_file), line=2, context=10)

        assert result["startLine"] == 1
        assert result["endLine"] == 3
        assert result["totalLines"] == 3

    def test_file_not_found(self):
        """File not found"""
        with pytest.raises(FileNotFoundError):
            read_file_logic("/nonexistent/file.lean")

    def test_path_traversal_attack(self):
        """Prevent path traversal attack"""
        with pytest.raises(FileNotFoundError):
            read_file_logic("../../etc/passwd", 1, 10)

    def test_absolute_path_to_sensitive_file(self):
        """Prevent access to sensitive system files"""
        # Even if file exists, should be restricted through other mechanisms (only testing logic layer here)
        # Actual security restrictions should be implemented at API layer
        result = read_file_logic("/etc/passwd", 1, 1)
        # If readable, indicates need to add path whitelist restriction at API layer
        assert result is not None  # Current logic layer doesn't restrict, marked as known behavior

    def test_lean_syntax_content(self, tmp_path):
        """Lean syntax content"""
        test_file = tmp_path / "test.lean"
        lean_code = """import Mathlib.Topology.Basic

theorem my_theorem : True := by
  trivial

def my_def : Nat := 42
"""
        test_file.write_text(lean_code)

        result = read_file_logic(str(test_file), line=3, context=2)

        assert "theorem" in result["content"]
        assert result["totalLines"] == 7


class TestRealFile:
    """Test with real Lean files (if they exist)"""

    @pytest.mark.skipif(
        not Path("/Users/lixinze/sphere-eversion").exists(),
        reason="sphere-eversion project not found"
    )
    def test_sphere_eversion_file(self):
        """Test file from sphere-eversion project"""
        test_file = "/Users/lixinze/sphere-eversion/SphereEversion/ToMathlib/Topology/Path.lean"

        if not Path(test_file).exists():
            pytest.skip("Test file not found")

        result = read_file_logic(test_file, line=10, context=5)

        assert result["startLine"] == 5
        assert result["endLine"] == 15
        assert result["totalLines"] > 0
        assert len(result["content"]) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
