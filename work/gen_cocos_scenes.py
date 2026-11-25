# -*- coding: utf-8 -*-
"""
生成 F:/sanguo/game/cocos/assets/scene/*.scene（Cocos Creator 3.8.8）。

骨架来源：编辑器「新建 2D 场景」默认内容
  F:/sanguo/tools/cocos/cc388/resources/resources/3d/engine/editor/assets/default_file_content/scene/scene-2d.scene
   索引 0        cc.SceneAsset
        1        cc.Scene（_globals -> 8）
        2        Canvas 节点
        3        Camera 节点
        4        cc.Camera        (挂在 3)
        5        cc.UITransform   (挂在 2)
        6        cc.Canvas        (挂在 2)
        7        cc.Widget        (挂在 2)
        8..14    cc.SceneGlobals + ambient/shadows/skybox/fog/octree/skin
本脚本只替换 0..7 的内容、8..14 整段照抄模板，再追加 15 = 业务 Root 脚本组件。

脚本组件在场景 JSON 里的 __type__ 是脚本 .meta uuid 的「压缩 uuid」（23 字符）。
"""
import json
import os
import random
import string
import sys

TEMPLATE = (r"F:\sanguo\tools\cocos\cc388\resources\resources\3d\engine\editor\assets"
            r"\default_file_content\scene\scene-2d.scene")
PROJ = r"F:\sanguo\game\cocos"
SCENE_DIR = os.path.join(PROJ, "assets", "scene")
SCRIPTS = os.path.join(PROJ, "assets", "scripts")

KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

# 设计分辨率
DESIGN_W, DESIGN_H = 750, 1334


def compress_uuid(u):
    """36 字符 uuid -> 23 字符压缩 uuid（Creator 的 __type__ 用这个）。"""
    u0 = u[:5]
    rest = u[5:].replace("-", "")
    out = u0
    for i in range(0, len(rest), 3):
        v = int(rest[i:i + 3], 16)  # 12 bit
        out += KEYS[v >> 6] + KEYS[v & 63]
    return out


def script_uuid(name):
    meta = os.path.join(SCRIPTS, name + ".ts.meta")
    with open(meta, encoding="utf-8") as f:
        return json.load(f)["uuid"]


_ids = set()


def gen_id():
    """22 字符的节点/组件 _id，文件内唯一即可。"""
    while True:
        s = "".join(random.choice(KEYS) for _ in range(22))
        if s not in _ids:
            _ids.add(s)
            return s


def vec3(x=0.0, y=0.0, z=0.0):
    return {"__type__": "cc.Vec3", "x": x, "y": y, "z": z}


def node(name, parent, children, comps, layer, lpos):
    return {
        "__type__": "cc.Node",
        "_name": name,
        "_objFlags": 0,
        "_parent": parent,
        "_children": children,
        "_active": True,
        "_components": comps,
        "_prefab": None,
        "_lpos": lpos,
        "_lrot": {"__type__": "cc.Quat", "x": 0, "y": 0, "z": 0, "w": 1},
        "_lscale": vec3(1, 1, 1),
        "_layer": layer,
        "_euler": vec3(),
        "_id": gen_id(),
    }


def build_scene(scene_name, script_class, scene_uuid, tpl):
    """拼一个 Canvas + 正交 UI 相机 + 业务脚本组件的场景。"""
    ui_2d = 33554432           # Layers.Enum.UI_2D
    default_layer = 1073741824  # Layers.Enum.DEFAULT（相机节点用）
    # DEFAULT | UI_2D | IGNORE_RAYCAST，模板同款；只要含 UI_2D 就能看见 UI
    visibility = 1108344832

    asset = {
        "__type__": "cc.SceneAsset",
        "_name": scene_name,
        "_objFlags": 0,
        "_native": "",
        "scene": {"__id__": 1},
    }

    scene = {
        "__type__": "cc.Scene",
        "_name": scene_name,
        "_objFlags": 0,
        "_parent": None,
        "_children": [{"__id__": 2}],
        "_active": True,
        "_components": [],
        "_prefab": None,
        "autoReleaseAssets": False,
        "_globals": {"__id__": 8},
        "_id": scene_uuid,
    }

    canvas = node(
        "Canvas", {"__id__": 1},
        [{"__id__": 3}],
        [{"__id__": 5}, {"__id__": 6}, {"__id__": 7}, {"__id__": 15}],
        ui_2d,
        vec3(DESIGN_W / 2, DESIGN_H / 2, 0),
    )
    camera_node = node("Camera", {"__id__": 2}, [], [{"__id__": 4}],
                       default_layer, vec3(0, 0, 1000))

    camera = {
        "__type__": "cc.Camera",
        "_name": "",
        "_objFlags": 0,
        "node": {"__id__": 3},
        "_enabled": True,
        "__prefab": None,
        "_projection": 0,          # ORTHO
        "_priority": 0,
        "_fov": 45,
        "_fovAxis": 0,
        "_orthoHeight": DESIGN_H / 2,
        "_near": 0,
        "_far": 2000,
        "_color": {"__type__": "cc.Color", "r": 0, "g": 0, "b": 0, "a": 255},
        "_depth": 1,
        "_stencil": 0,
        "_clearFlags": 7,          # SOLID_COLOR
        "_rect": {"__type__": "cc.Rect", "x": 0, "y": 0, "width": 1, "height": 1},
        "_aperture": 19,
        "_shutter": 7,
        "_iso": 0,
        "_screenScale": 1,
        "_visibility": visibility,
        "_targetTexture": None,
        "_id": gen_id(),
    }

    canvas_ui = {
        "__type__": "cc.UITransform",
        "_name": "",
        "_objFlags": 0,
        "node": {"__id__": 2},
        "_enabled": True,
        "__prefab": None,
        "_contentSize": {"__type__": "cc.Size", "width": DESIGN_W, "height": DESIGN_H},
        "_anchorPoint": {"__type__": "cc.Vec2", "x": 0.5, "y": 0.5},
        "_id": gen_id(),
    }

    canvas_comp = {
        "__type__": "cc.Canvas",
        "_name": "",
        "_objFlags": 0,
        "node": {"__id__": 2},
        "_enabled": True,
        "__prefab": None,
        "_cameraComponent": {"__id__": 4},
        "_alignCanvasWithScreen": True,
        "_id": gen_id(),
    }

    # 全屏拉伸（alignFlags 45 = TOP|BOT|LEFT|RIGHT），模板同款
    widget = {
        "__type__": "cc.Widget",
        "_name": "",
        "_objFlags": 0,
        "node": {"__id__": 2},
        "_enabled": True,
        "__prefab": None,
        "_alignFlags": 45,
        "_target": None,
        "_left": 0, "_right": 0, "_top": 0, "_bottom": 0,
        "_horizontalCenter": 0, "_verticalCenter": 0,
        "_isAbsLeft": True, "_isAbsRight": True,
        "_isAbsTop": True, "_isAbsBottom": True,
        "_isAbsHorizontalCenter": True, "_isAbsVerticalCenter": True,
        "_originalWidth": 0, "_originalHeight": 0,
        "_alignMode": 2,
        "_lockFlags": 0,
        "_id": gen_id(),
    }

    cid = compress_uuid(script_uuid(script_class))
    script = {
        "__type__": cid,
        "_name": "",
        "_objFlags": 0,
        "node": {"__id__": 2},
        "_enabled": True,
        "__prefab": None,
        "_id": gen_id(),
    }

    out = [asset, scene, canvas, camera_node, camera, canvas_ui, canvas_comp, widget]
    out += [json.loads(json.dumps(o)) for o in tpl[8:15]]  # globals 照抄
    out.append(script)
    return out, cid


def main():
    with open(TEMPLATE, encoding="utf-8") as f:
        tpl = json.load(f)
    assert tpl[8]["__type__"] == "cc.SceneGlobals", tpl[8]["__type__"]

    # 场景文件名 = 脚本 loadScene() 里的字符串（getSceneInfo 是大小写敏感的
    # endsWith('/<Name>.scene') 匹配），所以必须 CamelCase。
    plan = [
        ("Boot", "BootRoot", "0b007000-1a2b-4c3d-8e4f-000000000001"),
        ("Campaign", "CampaignRoot", "0ca3d000-1a2b-4c3d-8e4f-000000000002"),
        ("Deploy", "DeployRoot", "0de91000-1a2b-4c3d-8e4f-000000000003"),
        ("Battle", "BattleRoot", "0ba77100-1a2b-4c3d-8e4f-000000000004"),
    ]

    os.makedirs(SCENE_DIR, exist_ok=True)
    report = []
    for name, cls, uuid in plan:
        data, cid = build_scene(name, cls, uuid, tpl)
        path = os.path.join(SCENE_DIR, name + ".scene")
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        meta = {
            "ver": "1.1.50",
            "importer": "scene",
            "imported": True,
            "uuid": uuid,
            "files": [".json"],
            "subMetas": {},
            "userData": {},
        }
        mpath = path + ".meta"
        if not os.path.exists(mpath):
            with open(mpath, "w", encoding="utf-8", newline="\n") as f:
                json.dump(meta, f, indent=2)
                f.write("\n")
        report.append((name, cls, script_uuid(cls), cid, os.path.getsize(path), uuid))

    for name, cls, su, cid, size, uuid in report:
        print(f"{name}.scene  {cls:13s} uuid={su}  cid={cid}  {size}B  scene_uuid={uuid}")


if __name__ == "__main__":
    sys.exit(main())
