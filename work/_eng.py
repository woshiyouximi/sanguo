import json
tpl = r"F:\sanguo\tools\cocos\cc388\resources\templates\empty-2d\settings\v2\packages\engine.json"
dst = r"F:\sanguo\game\cocos\settings\v2\packages\engine.json"
j = json.load(open(tpl, "r", encoding="utf-8"))
cfg = j["modules"]["configs"]["defaultConfig"]
cache = cfg["cache"]
off = ["skeletal-animation","3d","xr","particle","physics","physics-ammo","physics-cannon","physics-physx",
       "physics-builtin","physics-2d","physics-2d-box2d","physics-2d-builtin","primitive","profiler",
       "occlusion-query","geometry-renderer","debug-renderer","particle-2d","audio","video","webview",
       "websocket","websocket-server","terrain","light-probe","tiled-map","spine","dragon-bones",
       "marionette","rich-text","mask","animation"]
for k in off:
    if k in cache:
        cache[k]["_value"] = False
keep_on = ["base","gfx-webgl","gfx-webgl2","2d","ui","graphics","affine-transform","intersection-2d"]
for k in keep_on:
    cache.setdefault(k, {})["_value"] = True
cfg["includeModules"] = ["base","gfx-webgl","gfx-webgl2","2d","ui","graphics","affine-transform","intersection-2d","custom-pipeline"]
j["__version__"] = "1.0.12"
open(dst, "w", encoding="utf-8", newline="\n").write(json.dumps(j, indent=4, ensure_ascii=False) + "\n")
print("written", len(open(dst,'rb').read()))
print("includeModules:", cfg["includeModules"])
print("still true:", [k for k,v in cache.items() if v.get("_value") is True])
