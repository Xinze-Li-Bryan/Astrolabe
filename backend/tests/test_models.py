from astrolabe.models import Node, NodeMeta, Edge, ProofStatus


class TestNodeMeta:
    def test_empty_meta(self):
        meta = NodeMeta()
        assert meta.to_dict() == {}

    def test_meta_with_values(self):
        meta = NodeMeta(
            label="Main Theorem",
            color="#f1c40f",
            size=12.0,
            notes="Important result",
            tags=["main", "number-theory"],
        )
        d = meta.to_dict()
        assert d["label"] == "Main Theorem"
        assert d["color"] == "#f1c40f"
        assert d["size"] == 12.0
        assert d["notes"] == "Important result"
        assert d["tags"] == ["main", "number-theory"]

    def test_meta_with_pinned(self):
        """Test pinned property (position data moved to canvas.json)"""
        meta = NodeMeta(pinned=True)
        d = meta.to_dict()
        assert d["pinned"] is True

    def test_meta_from_dict(self):
        data = {
            "label": "Test",
            "color": "#fff",
            "pinned": True,
            "notes": "Important note",
        }
        meta = NodeMeta.from_dict(data)
        assert meta.label == "Test"
        assert meta.color == "#fff"
        assert meta.pinned is True
        assert meta.notes == "Important note"

    def test_meta_from_dict_ignores_legacy_tex_fields(self):
        """from_dict should ignore old tex fields (backward compatibility)"""
        data = {
            "label": "Test",
            "texStatement": "If $x = 1$...",  # Old field, should be ignored
            "texProof": "Proof...",  # Old field, should be ignored
        }
        meta = NodeMeta.from_dict(data)
        assert meta.label == "Test"
        # Confirm no tex-related properties
        assert not hasattr(meta, 'tex_statement')
        assert not hasattr(meta, 'tex_proof')

    def test_node_meta_only_notes(self):
        """NodeMeta only contains notes field, not tex fields"""
        meta = NodeMeta(notes="test note", tags=["tag1"])
        assert meta.notes == "test note"
        assert not hasattr(meta, 'tex_statement')
        assert not hasattr(meta, 'tex_proof')


class TestNode:
    def test_node_creation(self):
        node = Node(
            id="MyModule.myTheorem",
            name="myTheorem",
            kind="theorem",
            file_path="MyModule.lean",
            line_number=10,
        )
        assert node.id == "MyModule.myTheorem"
        assert node.status == ProofStatus.UNKNOWN
        assert node.meta.label is None
        assert node.meta.color is None

    def test_node_with_meta(self):
        meta = NodeMeta(color="#f1c40f", notes="Important")
        node = Node(
            id="Test.theorem1",
            name="theorem1",
            kind="theorem",
            file_path="Test.lean",
            line_number=5,
            meta=meta,
        )
        assert node.meta.color == "#f1c40f"
        assert node.meta.notes == "Important"

    def test_node_to_dict(self):
        meta = NodeMeta(label="Theorem 1", color="#f1c40f")
        node = Node(
            id="Test.lemma1",
            name="lemma1",
            kind="lemma",
            file_path="Test.lean",
            line_number=5,
            status=ProofStatus.PROVEN,
            references=["Test.helper"],
            meta=meta,
        )
        d = node.to_dict()
        assert d["id"] == "Test.lemma1"
        assert d["status"] == "proven"
        assert d["references"] == ["Test.helper"]
        assert d["filePath"] == "Test.lean"
        assert d["meta"]["label"] == "Theorem 1"
        assert d["meta"]["color"] == "#f1c40f"


class TestEdge:
    def test_edge_creation(self):
        edge = Edge(source="A", target="B")
        assert edge.id == "A->B"
        assert edge.from_lean is True

    def test_edge_to_dict(self):
        edge = Edge(source="Foo.bar", target="Foo.baz", from_lean=True)
        d = edge.to_dict()
        assert d["id"] == "Foo.bar->Foo.baz"
        assert d["source"] == "Foo.bar"
        assert d["target"] == "Foo.baz"
        assert d["fromLean"] is True
        assert d["visible"] is True


class TestProofStatus:
    def test_status_values(self):
        assert ProofStatus.PROVEN.value == "proven"
        assert ProofStatus.SORRY.value == "sorry"
        assert ProofStatus.ERROR.value == "error"
        assert ProofStatus.UNKNOWN.value == "unknown"
