"""
Line Number Accuracy Tests
Test accuracy of node line number parsing

Problem description:
After clicking 3D node, Monaco Editor cannot jump to correct position

Possible causes:
1. .ilean's definition field is the name position, not the declaration keyword position
2. Multi-line declarations (with attributes or docstring) may cause line number offset
3. Line number conversion (0-indexed vs 1-indexed) issues
"""

import pytest
import json
from pathlib import Path
from textwrap import dedent


class TestIleanLineNumberParsing:
    """Test line number extraction during .ilean parsing"""

    @pytest.fixture
    def sample_lean_file(self, tmp_path):
        """Create a typical Lean file with various declaration forms"""
        content = dedent("""\
            import Mathlib.Tactic

            /-- This is a doc comment -/
            theorem simple_theorem : True := trivial

            @[simp]
            theorem with_attribute : True := trivial

            /--
            Multi-line doc comment
            This theorem's name is on line 12
            -/
            theorem multiline_doc : True := trivial

            theorem long_signature
              (x : Nat) (y : Nat)
              (h : x < y) : x ≤ y := by
              omega

            -- Simple comment
            lemma simple_lemma : True := trivial

            def some_definition : Nat := 42
        """)
        lean_file = tmp_path / "Test.lean"
        lean_file.write_text(content)
        return lean_file, content.split('\n')

    def test_simple_theorem_line_number(self, sample_lean_file):
        """
        Simple declaration: line number should point to 'theorem' keyword

        Given: theorem simple_theorem : True := trivial
        When: Parse line number
        Then: Line number should be the line with 'theorem' (line 4, 1-indexed)
        """
        lean_file, lines = sample_lean_file

        # Find line containing 'theorem simple_theorem'
        for i, line in enumerate(lines):
            if 'theorem simple_theorem' in line:
                expected_line = i + 1  # Convert to 1-indexed
                break
        else:
            pytest.fail("Could not find 'theorem simple_theorem' in file")

        # Simulate definition position returned by .ilean
        # Usually points to the declaration name position
        name_position_line = expected_line - 1  # 0-indexed

        from astrolabe.parsers.ilean_parser import find_declaration_start

        # Verify find_declaration_start can find the correct line
        actual_start = find_declaration_start(lines, name_position_line)

        # Should return the same line (because theorem and name are on the same line)
        assert actual_start == name_position_line, \
            f"Expected line {name_position_line}, got {actual_start}"

    def test_theorem_with_attribute_line_number(self, sample_lean_file):
        """
        Declaration with attribute: line number should point to 'theorem' keyword, not @[simp]

        Given:
            @[simp]
            theorem with_attribute : True := trivial
        When: Parse line number
        Then: Line number should be the line with 'theorem'
        """
        lean_file, lines = sample_lean_file

        # Find line containing 'theorem with_attribute'
        theorem_line = None
        for i, line in enumerate(lines):
            if 'theorem with_attribute' in line:
                theorem_line = i
                break

        assert theorem_line is not None, "Could not find 'theorem with_attribute'"

        from astrolabe.parsers.ilean_parser import find_declaration_start

        # Assume .ilean's definition points to name 'with_attribute'
        # We need to verify find_declaration_start can correctly find 'theorem' line
        actual_start = find_declaration_start(lines, theorem_line)

        assert actual_start == theorem_line, \
            f"Expected theorem line {theorem_line}, got {actual_start}"

    def test_theorem_with_multiline_doc_line_number(self, sample_lean_file):
        """
        Declaration with multi-line doc: line number should point to 'theorem' keyword

        Given:
            /--
            Multi-line doc comment
            -/
            theorem multiline_doc : True := trivial
        When: Parse line number
        Then: Line number should be the line with 'theorem', not doc comment line
        """
        lean_file, lines = sample_lean_file

        # Find line containing 'theorem multiline_doc'
        theorem_line = None
        for i, line in enumerate(lines):
            if 'theorem multiline_doc' in line:
                theorem_line = i
                break

        assert theorem_line is not None, "Could not find 'theorem multiline_doc'"

        from astrolabe.parsers.ilean_parser import find_declaration_start

        actual_start = find_declaration_start(lines, theorem_line)

        assert actual_start == theorem_line, \
            f"Expected theorem line {theorem_line}, got {actual_start}"

    def test_long_signature_theorem_line_number(self, sample_lean_file):
        """
        Multi-line signature declaration: line number should point to 'theorem' keyword

        Given:
            theorem long_signature
              (x : Nat) (y : Nat)
              (h : x < y) : x ≤ y := by
        When: .ilean definition may point to middle line of signature
        Then: Line number should be the line with 'theorem'
        """
        lean_file, lines = sample_lean_file

        # Find line containing 'theorem long_signature'
        theorem_line = None
        for i, line in enumerate(lines):
            if 'theorem long_signature' in line:
                theorem_line = i
                break

        assert theorem_line is not None, "Could not find 'theorem long_signature'"

        from astrolabe.parsers.ilean_parser import find_declaration_start

        # Test: if .ilean points to a line in the signature (like the h : x < y line)
        # find_declaration_start should search upward to find 'theorem' line
        signature_middle_line = theorem_line + 2  # (h : x < y) line

        actual_start = find_declaration_start(lines, signature_middle_line)

        assert actual_start == theorem_line, \
            f"Expected theorem at line {theorem_line}, got {actual_start}"


class TestNodeLineNumberStorage:
    """Test correctness of node line numbers during parsing and storage"""

    @pytest.fixture
    def mock_ilean_data(self):
        """Simulate .ilean file JSON data"""
        return {
            "module": "Test",
            "directImports": [],
            "references": {
                # theorem simple : True := trivial
                # Assume 'simple' name is on line 5 (0-indexed=4), column 8
                '{"c":{"m":"Test","n":"simple"}}': {
                    "definition": [4, 8, 4, 14],  # [line, col, endLine, endCol]
                    "usages": []
                },
                # theorem with_long_name_on_next_line
                #   : True := trivial
                # Assume name is on line 7, but theorem keyword is on line 6
                '{"c":{"m":"Test","n":"with_long_name_on_next_line"}}': {
                    "definition": [7, 2, 7, 28],  # Name on line 8 (0-indexed=7)
                    "usages": []
                }
            }
        }

    def test_line_number_is_1_indexed_in_node(self, tmp_path, mock_ilean_data):
        """
        Node.line_number should be 1-indexed (format expected by Monaco)

        Given: .ilean definition[0] = 4 (0-indexed)
        When: Parse to generate Node
        Then: node.line_number = 5 (1-indexed)
        """
        # Create .ilean file
        ilean_file = tmp_path / ".lake" / "build" / "lib" / "lean" / "Test.ilean"
        ilean_file.parent.mkdir(parents=True, exist_ok=True)
        ilean_file.write_text(json.dumps(mock_ilean_data))

        # Create source file
        lean_file = tmp_path / "Test.lean"
        lean_file.write_text(dedent("""\
            import Mathlib

            -- Line 3
            -- Line 4
            theorem simple : True := trivial

            theorem with_long_name_on_next_line
              : True := trivial
        """))

        from astrolabe.parsers.ilean_parser import parse_ilean_file

        nodes, imports, usage_map = parse_ilean_file(ilean_file, tmp_path)

        # Find simple node
        simple_node = next((n for n in nodes if n.name == "simple"), None)
        assert simple_node is not None, "Could not find 'simple' node"

        # Verify it's 1-indexed
        assert simple_node.line_number == 5, \
            f"Expected 1-indexed line 5, got {simple_node.line_number}"


class TestFrontendLineNumberFlow:
    """Test frontend line number receiving and usage flow"""

    def test_backend_response_line_number_format(self):
        """
        Backend API response lineNumber should be 1-indexed integer

        This is a documentation test - verify the contract
        """
        # This is a documentation test, verifying API contract
        # Actual test requires starting backend server

        expected_response_format = {
            "nodes": [
                {
                    "id": "Test.theorem1",
                    "name": "theorem1",
                    "kind": "theorem",
                    "filePath": "/path/to/Test.lean",
                    "lineNumber": 10,  # Must be 1-indexed integer > 0
                    # ...
                }
            ]
        }

        # Verify lineNumber field type
        node = expected_response_format["nodes"][0]
        assert isinstance(node["lineNumber"], int)
        assert node["lineNumber"] > 0, "lineNumber must be 1-indexed (> 0)"


class TestIleanDefinitionPosition:
    """
    Test the actual meaning of .ilean definition field

    Core question: what position does the definition field store?
    - Position of declaration keyword (theorem/lemma)?
    - Position of declaration name?
    - Start position of entire declaration?
    """

    def test_definition_points_to_name_not_keyword(self, tmp_path):
        """
        Verify: .ilean definition points to declaration name, not keyword

        Given:
            Line 0: import Mathlib
            Line 1:
            Line 2: theorem myTheorem : True := trivial

        If definition = [2, 8, 2, 17]:
            - Line 2, Column 8-17 = 'myTheorem' (the name)
            - NOT 'theorem' (column 0-6)
        """
        # Create test file
        lean_content = dedent("""\
            import Mathlib

            theorem myTheorem : True := trivial
        """)
        lean_file = tmp_path / "Test.lean"
        lean_file.write_text(lean_content)

        lines = lean_content.split('\n')

        # Find theorem line
        theorem_line = None
        for i, line in enumerate(lines):
            if 'theorem myTheorem' in line:
                theorem_line = i
                break

        assert theorem_line is not None

        # In 'theorem myTheorem : True := trivial'
        # 'theorem' starts at column 0
        # 'myTheorem' starts at column 8
        line = lines[theorem_line]
        name_col = line.index('myTheorem')

        # Verify 'theorem' and name are in different columns
        assert name_col > 0, "Name should not be at column 0"
        assert line[0:7] == 'theorem', "Line should start with 'theorem'"

        # This means if definition points to [theorem_line, name_col, ...]
        # it points to the name position, not keyword position

    def test_stored_line_should_be_keyword_line(self, tmp_path):
        """
        Key test: stored line number should be keyword line, not name line

        Especially important when name and keyword are on different lines:
            theorem
              myTheorem  <-- definition may point here
              : True := trivial

        User expectation: clicking node should jump to 'theorem' line
        """
        lean_content = dedent("""\
            import Mathlib

            theorem
              veryLongTheoremName
              : True := trivial
        """)

        lean_file = tmp_path / "Test.lean"
        lean_file.write_text(lean_content)

        lines = lean_content.split('\n')

        # Find 'theorem' line and name line
        keyword_line = None
        name_line = None
        for i, line in enumerate(lines):
            if line.strip() == 'theorem':
                keyword_line = i
            if 'veryLongTheoremName' in line:
                name_line = i

        assert keyword_line is not None, "Could not find 'theorem' keyword line"
        assert name_line is not None, "Could not find name line"
        assert name_line > keyword_line, "Name should be after keyword"

        from astrolabe.parsers.ilean_parser import find_declaration_start

        # If .ilean definition points to name_line
        # find_declaration_start should return keyword_line
        actual_start = find_declaration_start(lines, name_line)

        assert actual_start == keyword_line, \
            f"Should find keyword at line {keyword_line}, got {actual_start}. " \
            f"This means clicking the node will jump to wrong line!"


class TestLineNumberBug:
    """
    Core Bug Test: Node.line_number uses name position, not keyword position

    This causes Monaco Editor to jump to wrong line after clicking node
    """

    def test_node_line_number_uses_ilean_directly(self, tmp_path):
        """
        Test: directly use line number provided by .ilean

        .ilean's definition field points to name position, usually on same line as keyword
        """
        import json

        # Create mock project structure
        (tmp_path / ".lake" / "build" / "lib" / "lean").mkdir(parents=True)

        # Create Lean source file
        lean_content = """\
import Mathlib

theorem sphere_eversion : True := by
  trivial
"""
        lean_file = tmp_path / "Test.lean"
        lean_file.write_text(lean_content)

        # Create .ilean file
        # definition points to correct line number (line 2, 0-indexed)
        ilean_data = {
            "module": "Test",
            "directImports": [],
            "references": {
                '{"c":{"m":"Test","n":"sphere_eversion"}}': {
                    "definition": [2, 8, 2, 24],  # Line 3 (0-indexed=2), name position
                    "usages": []
                }
            }
        }
        ilean_file = tmp_path / ".lake" / "build" / "lib" / "lean" / "Test.ilean"
        ilean_file.write_text(json.dumps(ilean_data))

        from astrolabe.parsers.ilean_parser import parse_ilean_file

        nodes, imports, usage_map = parse_ilean_file(ilean_file, tmp_path)

        assert len(nodes) == 1, f"Expected 1 node, got {len(nodes)}"
        node = nodes[0]

        # Directly use .ilean's line number (line 3, 1-indexed)
        assert node.line_number == 3, \
            f"node.line_number should be 3, but got {node.line_number}"

    def test_extract_full_declaration_finds_correct_start(self, tmp_path):
        """
        Verify extract_full_declaration can find correct start line

        But the problem is: this result is not used for node.line_number
        """
        lean_content = """\
theorem
  multiLineTheorem
  : True := trivial
"""
        lines = lean_content.split('\n')

        from astrolabe.parsers.ilean_parser import extract_full_declaration, find_declaration_start

        # .ilean definition points to name line (line 1, 0-indexed)
        name_line = 1

        # find_declaration_start should return line 0
        actual_start = find_declaration_start(lines, name_line)
        assert actual_start == 0, f"find_declaration_start should return 0, got {actual_start}"

        # extract_full_declaration internally calls find_declaration_start
        content = extract_full_declaration(lines, name_line)
        assert content.startswith('theorem'), f"Content should start with 'theorem', got: {content[:20]}"


class TestEdgeCases:
    """Edge case tests"""

    def test_line_hint_exceeds_file_length(self, tmp_path):
        """
        When .ilean reported line number exceeds file length, should search upward from end of file for keyword

        Given: File has only 5 lines, contains one theorem
        When: .ilean definition reports line number 100
        Then: Should search upward to find the line with theorem
        """
        content = dedent("""\
            import Mathlib

            theorem only_theorem : True := trivial

        """)  # 5 lines
        lean_file = tmp_path / "Test.lean"
        lean_file.write_text(content)

        lines = content.split('\n')
        assert len(lines) == 5, f"Expected 5 lines, got {len(lines)}"

        from astrolabe.parsers.ilean_parser import find_declaration_start

        # .ilean reported line number exceeds file range
        result = find_declaration_start(lines, 100)

        # Should not return out of range line number
        assert result < len(lines), \
            f"Should not return line {result} when file only has {len(lines)} lines"

        # Should find the line with theorem (line 2, 0-indexed)
        assert result == 2, \
            f"Should find 'theorem' at line 2, got {result}"

    def test_line_number_clamped_to_file_length(self, tmp_path):
        """
        When .ilean line number exceeds file range, clamp to end of file
        """
        import json

        (tmp_path / ".lake" / "build" / "lib" / "lean").mkdir(parents=True)

        # 5 line file
        lean_content = """\
import Mathlib

theorem my_theorem : True := trivial

"""
        lean_file = tmp_path / "Test.lean"
        lean_file.write_text(lean_content)

        # .ilean gives out of range line number
        ilean_data = {
            "module": "Test",
            "directImports": [],
            "references": {
                '{"c":{"m":"Test","n":"my_theorem"}}': {
                    "definition": [999, 0, 999, 10],  # Out of range
                    "usages": []
                }
            }
        }
        ilean_file = tmp_path / ".lake" / "build" / "lib" / "lean" / "Test.ilean"
        ilean_file.write_text(json.dumps(ilean_data))

        from astrolabe.parsers.ilean_parser import parse_ilean_file

        nodes, imports, usage_map = parse_ilean_file(ilean_file, tmp_path)

        assert len(nodes) == 1
        node = nodes[0]

        # Line number should be clamped to file range
        lines = lean_content.split('\n')
        assert node.line_number <= len(lines), \
            f"line_number {node.line_number} should be <= file length {len(lines)}"

    def test_theorem_at_first_line(self, tmp_path):
        """Theorem at first line of file"""
        content = "theorem first_line : True := trivial\n"
        lean_file = tmp_path / "Test.lean"
        lean_file.write_text(content)

        lines = content.split('\n')

        from astrolabe.parsers.ilean_parser import find_declaration_start

        # definition points to line 0
        actual = find_declaration_start(lines, 0)
        assert actual == 0

    def test_nested_namespace_theorem(self, tmp_path):
        """Theorem inside namespace"""
        content = dedent("""\
            namespace Foo

            theorem bar : True := trivial

            end Foo
        """)
        lean_file = tmp_path / "Test.lean"
        lean_file.write_text(content)

        lines = content.split('\n')

        # Find theorem line
        theorem_line = None
        for i, line in enumerate(lines):
            if 'theorem bar' in line:
                theorem_line = i
                break

        from astrolabe.parsers.ilean_parser import find_declaration_start

        actual = find_declaration_start(lines, theorem_line)
        assert actual == theorem_line

    def test_keyword_more_than_10_lines_above(self, tmp_path):
        """
        Edge case when keyword is more than 10 lines above name

        Current implementation only searches 10 lines up, will fail beyond this range
        """
        # Construct a case where keyword is 15 lines above (though not common)
        content = dedent("""\
            theorem
              -- comment 1
              -- comment 2
              -- comment 3
              -- comment 4
              -- comment 5
              -- comment 6
              -- comment 7
              -- comment 8
              -- comment 9
              -- comment 10
              -- comment 11
              veryFarName
              : True := trivial
        """)
        lean_file = tmp_path / "Test.lean"
        lean_file.write_text(content)

        lines = content.split('\n')

        # Find name line
        name_line = None
        for i, line in enumerate(lines):
            if 'veryFarName' in line:
                name_line = i
                break

        from astrolabe.parsers.ilean_parser import find_declaration_start

        # Current implementation only searches 10 lines, this test is expected to fail
        actual = find_declaration_start(lines, name_line)

        # Expected: return line 0 (where theorem is)
        # Actual: may return name_line (fallback when keyword not found)
        assert actual == 0, \
            f"Should find 'theorem' at line 0, got {actual}. " \
            f"Current implementation only searches 10 lines up!"
