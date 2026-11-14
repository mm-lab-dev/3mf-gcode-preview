"""MODEL-001: create a geometry-only, millimetre 3MF with FreeCAD's Python.

Run using the Python shipped in FreeCAD/bin. This script is the editable source
of truth; FCStd Part features are generated solids, not constraint-driven parts.
All outputs stay under the repository's sample directory. No slicing occurs.
"""

from collections import Counter
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZipFile, ZIP_DEFLATED

import FreeCAD as App
import Part


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "sample"
STEM = "feature_coverage"
PARAMS = {
    "block_length": 24.0, "block_width": 24.0, "block_height": 20.0,
    "bridge_x": 34.0, "bridge_span": 20.0, "bridge_pier": 8.0,
    "bridge_depth": 14.0, "roof_under_z": 22.0, "roof_thickness": 3.0,
    "overhang_y": 36.0, "overhang_stem": 8.0, "overhang_depth": 20.0,
    "overhang_projection": 20.0, "tower_side": 8.0,
}
NS = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
ET.register_namespace("", NS)


def box(x, y, z, dx, dy, dz):
    return Part.makeBox(dx, dy, dz, App.Vector(x, y, z))


def make_shapes(p):
    # Millimetres, XY build plane, +Z upward. All five objects contact Z=0.
    bx, pier, span = p["bridge_x"], p["bridge_pier"], p["bridge_span"]
    depth, under, roof = p["bridge_depth"], p["roof_under_z"], p["roof_thickness"]
    bridge = box(bx, 0, 0, pier, depth, under).fuse(
        box(bx + pier + span, 0, 0, pier, depth, under)
    ).fuse(box(bx, 0, under, 2 * pier + span, depth, roof)).removeSplitter()
    y, stem, dep = p["overhang_y"], p["overhang_stem"], p["overhang_depth"]
    cantilever = box(0, y, 0, stem, dep, under).fuse(
        box(0, y, under, stem + p["overhang_projection"], dep, roof)
    ).removeSplitter()
    side = p["tower_side"]
    return [
        ("InfillBlock", "Walls / infill / top / bottom", box(0, 0, 0, p["block_length"], p["block_width"], p["block_height"])),
        ("Bridge", "Bridge - 20 mm clear span", bridge),
        ("Cantilever", "Support test - 20 mm overhang", cantilever),
        ("TravelTowerA", "Travel island A", box(48, 42, 0, side, side, 16)),
        ("TravelTowerB", "Travel island B", box(72, 52, 0, side, side, 12)),
    ]


def mesh_and_verify(shape):
    points, faces = shape.tessellate(0.05)
    edges, balance = Counter(), Counter()
    volume = 0.0
    for a, b, c in faces:
        assert len({a, b, c}) == 3, "Degenerate triangle"
        va, vb, vc = points[a], points[b], points[c]
        assert (vb - va).cross(vc - va).Length > 1e-10
        volume += va.dot(vb.cross(vc)) / 6.0
        for u, v in [(a, b), (b, c), (c, a)]:
            key = tuple(sorted((u, v)))
            edges[key] += 1
            balance[key] += 1 if u < v else -1
    assert all(n == 2 for n in edges.values()), "Mesh has open or nonmanifold edges"
    assert all(n == 0 for n in balance.values()), "Inconsistent winding"
    assert volume > 0 and abs(volume - shape.Volume) < 1e-5, "Mesh/CAD volume mismatch"
    return points, faces, volume


def node(parent, tag, attrs=None):
    return ET.SubElement(parent, f"{{{NS}}}{tag}", attrs or {})


def build():
    OUT.mkdir(exist_ok=True)
    name = "FeatureCoverage"
    if name in App.listDocuments():
        raise RuntimeError("FeatureCoverage is already open; close it before regeneration")
    doc = App.newDocument(name)
    doc.Label = "MODEL-001 - slicer feature coverage"
    # Avoid out-of-project backup paths; script remains the parameter authority.
    doc.addObject("App::FeaturePython", "Parameters")
    params = doc.getObject("Parameters")
    for key, value in PARAMS.items():
        params.addProperty("App::PropertyLength", key, "Geometry")
        setattr(params, key, value)
    params.addProperty("App::PropertyString", "SourceOfTruth", "Traceability")
    params.SourceOfTruth = "scripts/create-feature-coverage.py (script-driven model)"
    model = ET.Element(f"{{{NS}}}model", {"unit": "millimeter", "xml:lang": "en-US"})
    node(model, "metadata", {"name": "Title"}).text = "MODEL-001 feature coverage"
    resources, build_items = node(model, "resources"), node(model, "build")
    shapes = make_shapes(PARAMS)
    report = {"proposal": "MODEL-001", "freecad_version": App.Version(), "units": "mm", "parameters": PARAMS, "objects": [], "sliced": False}
    for index, (internal, label, shape) in enumerate(shapes, 1):
        assert shape.isValid() and len(shape.Solids) == 1 and shape.isClosed()
        assert abs(shape.BoundBox.ZMin) < 1e-7
        obj = doc.addObject("PartDesign::Feature", internal)
        obj.Label, obj.Shape = label, shape
        points, faces, volume = mesh_and_verify(shape)
        entry = node(resources, "object", {"id": str(index), "type": "model", "name": label})
        mesh = node(entry, "mesh")
        vertices, triangles = node(mesh, "vertices"), node(mesh, "triangles")
        for v in points:
            node(vertices, "vertex", {"x": f"{v.x:.9g}", "y": f"{v.y:.9g}", "z": f"{v.z:.9g}"})
        for a, b, c in faces:
            node(triangles, "triangle", {"v1": str(a), "v2": str(b), "v3": str(c)})
        node(build_items, "item", {"objectid": str(index)})
        bb = shape.BoundBox
        report["objects"].append({"name": internal, "label": label, "bounds_mm": [bb.XMin, bb.YMin, bb.ZMin, bb.XMax, bb.YMax, bb.ZMax], "volume_mm3": volume, "triangles": len(faces), "closed_oriented_manifold": True, "center_of_volume_mm": list(shape.Solids[0].CenterOfMass)})
    for i, (_, _, a) in enumerate(shapes):
        for _, _, b in shapes[i + 1:]:
            assert a.common(b).Volume < 1e-7
            assert a.distToShape(b)[0] > 0
    bounds = Part.makeCompound([s for _, _, s in shapes]).BoundBox
    assert all(abs(a - b) < 1e-7 for a, b in zip([bounds.XLength, bounds.YLength, bounds.ZLength], [80, 60, 25]))
    report["overall_dimensions_mm"] = [bounds.XLength, bounds.YLength, bounds.ZLength]
    doc.recompute()
    fcstd = OUT / f"{STEM}.FCStd"
    doc.saveAs(str(fcstd))
    App.closeDocument(doc.Name)
    reopened = App.openDocument(str(fcstd))
    for internal, _, shape in shapes:
        restored = reopened.getObject(internal).Shape
        assert restored.isValid() and len(restored.Solids) == 1
        assert abs(restored.Volume - shape.Volume) < 1e-7
    App.closeDocument(reopened.Name)
    contents = b'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'
    rels = b'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'
    output = OUT / f"{STEM}.3mf"
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", contents)
        archive.writestr("_rels/.rels", rels)
        archive.writestr("3D/3dmodel.model", ET.tostring(model, encoding="utf-8", xml_declaration=True))
    # Verify the serialized 3MF, not just the in-memory source mesh.
    with ZipFile(output) as archive:
        assert archive.testzip() is None
        restored = ET.fromstring(archive.read("3D/3dmodel.model"))
        objects = restored.findall(f"{{{NS}}}resources/{{{NS}}}object")
        assert len(objects) == 5
        for obj, (_, _, shape) in zip(objects, shapes):
            vertices = obj.findall(f"{{{NS}}}mesh/{{{NS}}}vertices/{{{NS}}}vertex")
            points = [App.Vector(*[float(v.attrib[k]) for k in ("x", "y", "z")]) for v in vertices]
            triangles = obj.findall(f"{{{NS}}}mesh/{{{NS}}}triangles/{{{NS}}}triangle")
            volume = sum(points[int(t.attrib["v1"])].dot(points[int(t.attrib["v2"])].cross(points[int(t.attrib["v3"])])) / 6 for t in triangles)
            assert abs(volume - shape.Volume) < 1e-5
    report["fcstd_reopened"] = True
    report["serialized_3mf_verified"] = True
    (OUT / f"{STEM}_verification.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    build()
