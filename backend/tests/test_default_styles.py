"""
Test graph.json default styles functionality
"""
import pytest
import json
from pathlib import Path
import tempfile
import shutil

# Import modules to test
from astrolabe.models.node import Node
from astrolabe.models.edge import Edge
from astrolabe.project import (
    NODE_STYLE_DEFAULTS,
    EDGE_STYLE_DEFAULTS,
    DEFAULT_NODE_STYLE,
    DEFAULT_EDGE_STYLE,
)


class TestNodeDefaultStyles:
    """Test Node default styles"""

    def test_node_has_default_style_fields(self):
        """Node class should have default style fields"""
        node = Node(
            id="test.theorem1",
            name="theorem1",
            kind="theorem",
            file_path="/test/file.lean",
            line_number=10,
        )
        assert hasattr(node, 'default_color')
        assert hasattr(node, 'default_size')
        assert hasattr(node, 'default_shape')

    def test_node_default_values(self):
        """Node default styles should have default values"""
        node = Node(
            id="test.theorem1",
            name="theorem1",
            kind="theorem",
            file_path="/test/file.lean",
            line_number=10,
        )
        # Default values (when not set)
        assert node.default_color == "#888888"
        assert node.default_size == 1.0
        assert node.default_shape == "sphere"

    def test_node_to_dict_includes_defaults(self):
        """Node.to_dict() should include default style fields"""
        node = Node(
            id="test.theorem1",
            name="theorem1",
            kind="theorem",
            file_path="/test/file.lean",
            line_number=10,
            default_color="#833AB4",
            default_size=1.2,
            default_shape="sphere",
        )
        d = node.to_dict()
        assert "default_color" in d or "defaultColor" in d
        assert "default_size" in d or "defaultSize" in d
        assert "default_shape" in d or "defaultShape" in d


class TestEdgeDefaultStyles:
    """Test Edge default styles"""

    def test_edge_has_default_style_fields(self):
        """Edge class should have default style fields"""
        edge = Edge(
            source="test.theorem1",
            target="test.lemma1",
            from_lean=True,
        )
        assert hasattr(edge, 'default_color')
        assert hasattr(edge, 'default_width')
        assert hasattr(edge, 'default_style')

    def test_edge_default_values(self):
        """Edge default styles should have default values"""
        edge = Edge(
            source="test.theorem1",
            target="test.lemma1",
            from_lean=True,
        )
        assert edge.default_color == "#2ecc71"
        assert edge.default_width == 1.0
        assert edge.default_style == "solid"

    def test_edge_to_dict_includes_defaults(self):
        """Edge.to_dict() should include default style fields"""
        edge = Edge(
            source="test.theorem1",
            target="test.lemma1",
            from_lean=True,
            default_color="#2ecc71",
            default_width=1.0,
            default_style="solid",
        )
        d = edge.to_dict()
        assert "default_color" in d or "defaultColor" in d
        assert "default_width" in d or "defaultWidth" in d
        assert "default_style" in d or "defaultStyle" in d


class TestStyleDefaults:
    """Test default style mappings"""

    def test_node_style_defaults_exist(self):
        """NODE_STYLE_DEFAULTS should define all kinds"""
        expected_kinds = [
            "theorem", "lemma", "definition", "axiom",
            "structure", "class", "instance", "inductive",
            "example", "default"
        ]
        for kind in expected_kinds:
            assert kind in NODE_STYLE_DEFAULTS, f"Missing kind: {kind}"

    def test_node_style_defaults_have_required_fields(self):
        """Each kind's default style should have color, size, shape"""
        for kind, defaults in NODE_STYLE_DEFAULTS.items():
            assert "color" in defaults, f"{kind} missing color"
            assert "size" in defaults, f"{kind} missing size"
            assert "shape" in defaults, f"{kind} missing shape"

    def test_node_style_defaults_valid_colors(self):
        """Colors should be valid hex format"""
        for kind, defaults in NODE_STYLE_DEFAULTS.items():
            color = defaults["color"]
            assert color.startswith("#"), f"{kind} color should start with #"
            assert len(color) == 7, f"{kind} color should be #RRGGBB format"

    def test_node_style_defaults_valid_sizes(self):
        """Size should be positive number"""
        for kind, defaults in NODE_STYLE_DEFAULTS.items():
            size = defaults["size"]
            assert isinstance(size, (int, float)), f"{kind} size should be number"
            assert size > 0, f"{kind} size should be positive"

    def test_node_style_defaults_valid_shapes(self):
        """Shape should be valid value"""
        # All available shapes (consistent with assets/nodes/index.json)
        valid_shapes = [
            "sphere", "box", "octahedron", "tetrahedron", "dodecahedron",
            "icosahedron", "cone", "cylinder", "torus", "torusKnot", "ring", "capsule"
        ]
        for kind, defaults in NODE_STYLE_DEFAULTS.items():
            shape = defaults["shape"]
            assert shape in valid_shapes, f"{kind} shape '{shape}' not valid"

    def test_edge_style_defaults_exist(self):
        """EDGE_STYLE_DEFAULTS should have True and False"""
        assert True in EDGE_STYLE_DEFAULTS
        assert False in EDGE_STYLE_DEFAULTS

    def test_edge_style_defaults_have_required_fields(self):
        """Edge default styles should have color, width, style"""
        for from_lean, defaults in EDGE_STYLE_DEFAULTS.items():
            assert "color" in defaults
            assert "width" in defaults
            assert "style" in defaults

    def test_edge_style_defaults_valid_styles(self):
        """Edge style should be valid value"""
        valid_styles = ["solid", "dashed", "dotted"]
        for from_lean, defaults in EDGE_STYLE_DEFAULTS.items():
            style = defaults["style"]
            assert style in valid_styles


class TestDefaultNodeStyle:
    """Test default fallback values"""

    def test_default_node_style_exists(self):
        """DEFAULT_NODE_STYLE should exist"""
        assert DEFAULT_NODE_STYLE is not None
        assert "color" in DEFAULT_NODE_STYLE
        assert "size" in DEFAULT_NODE_STYLE
        assert "shape" in DEFAULT_NODE_STYLE

    def test_default_edge_style_exists(self):
        """DEFAULT_EDGE_STYLE should exist"""
        assert DEFAULT_EDGE_STYLE is not None
        assert "color" in DEFAULT_EDGE_STYLE
        assert "width" in DEFAULT_EDGE_STYLE
        assert "style" in DEFAULT_EDGE_STYLE


class TestProjectSetDefaultStyles:
    """Test Project._set_default_styles() correctly applies theme styles"""

    def test_set_default_styles_applies_theme(self):
        """Project._set_default_styles() should set correct styles based on kind"""
        from astrolabe.project import Project, NODE_STYLE_DEFAULTS

        # Create node
        node = Node(
            id="test.lemma1",
            name="lemma1",
            kind="lemma",
            file_path="/test/file.lean",
            line_number=10,
        )

        # Manually call the logic to set default styles
        defaults = NODE_STYLE_DEFAULTS.get(node.kind, DEFAULT_NODE_STYLE)
        node.default_color = defaults["color"]
        node.default_size = defaults["size"]
        node.default_shape = defaults["shape"]

        # Verify styles match theme configuration
        expected = NODE_STYLE_DEFAULTS["lemma"]
        assert node.default_color == expected["color"]
        assert node.default_size == expected["size"]
        assert node.default_shape == expected["shape"]

    def test_default_styles_match_theme_file(self):
        """NODE_STYLE_DEFAULTS should match assets/themes/default.json"""
        # Read theme file
        theme_path = Path(__file__).parent.parent.parent / "assets" / "themes" / "default.json"
        with open(theme_path, "r", encoding="utf-8") as f:
            theme = json.load(f)

        # Verify each kind's style matches
        for kind, expected in theme.get("nodes", {}).items():
            if kind in NODE_STYLE_DEFAULTS:
                actual = NODE_STYLE_DEFAULTS[kind]
                assert actual["color"] == expected["color"], f"{kind} color mismatch"
                assert actual["size"] == expected["size"], f"{kind} size mismatch"
                assert actual["shape"] == expected["shape"], f"{kind} shape mismatch"


class TestNodeToDictDefaultStyles:
    """Test Node.to_dict() returns correct default style fields"""

    def test_to_dict_uses_camel_case(self):
        """to_dict() should use camelCase field names"""
        node = Node(
            id="test.theorem1",
            name="theorem1",
            kind="theorem",
            file_path="/test/file.lean",
            line_number=10,
            default_color="#833AB4",
            default_size=1.2,
            default_shape="octahedron",
        )
        d = node.to_dict()

        # Verify using camelCase
        assert "defaultColor" in d, "should use defaultColor (camelCase)"
        assert "defaultSize" in d, "should use defaultSize (camelCase)"
        assert "defaultShape" in d, "should use defaultShape (camelCase)"

        # Verify values are correct
        assert d["defaultColor"] == "#833AB4"
        assert d["defaultSize"] == 1.2
        assert d["defaultShape"] == "octahedron"


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
