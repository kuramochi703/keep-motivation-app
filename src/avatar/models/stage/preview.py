"""アプリと同じカメラで stage.blend を撮る（保存しない）。

    blender.exe -b stage.blend -P preview.py -- out.png

カメラは AvatarCanvas の StageFit を 1400x840px の枠で再現したもの:
fov 32（縦）、高さ 840/118 単位が収まる距離、床は下端から FLOOR_PAD=0.9。
ひよこの大きさの目安に、背丈 2 の仮の卵形を原点に置く。
"""
import math, sys
import bpy

out = sys.argv[sys.argv.index('--') + 1]
W, H, PX = 1400, 840, 118
tall = H / PX
dist = tall / 2 / math.tan(math.radians(16))
floor = tall / 2 - 0.9

cam_data = bpy.data.cameras.new('PreviewCam')
cam_data.sensor_fit = 'VERTICAL'
cam_data.angle_y = math.radians(32)
cam = bpy.data.objects.new('PreviewCam', cam_data)
bpy.context.collection.objects.link(cam)
cam.location = (0, -dist, floor)
cam.rotation_euler = (math.pi / 2, 0, 0)
sc = bpy.context.scene
sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y = W, H

bpy.ops.mesh.primitive_uv_sphere_add(radius=0.7, location=(0, 0, 1.0))
bpy.context.object.scale.z = 1.4
m = bpy.data.materials.new('Stand'); m.diffuse_color = (1, 0.85, 0.3, 1)
bpy.context.object.data.materials.append(m)

sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
sun.data.energy = 2.5
sun.rotation_euler = (math.radians(50), math.radians(20), math.radians(30))
bpy.context.collection.objects.link(sun)
sc.world = sc.world or bpy.data.worlds.new('W')
sc.world.use_nodes = True
sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 2.6
sc.render.engine = 'BLENDER_EEVEE'
sc.view_settings.view_transform = 'Standard'
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
