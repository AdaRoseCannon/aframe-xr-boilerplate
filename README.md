xr-starter-kit
=============

A boiler plate project for getting started with VR and AR with AFrame

This site tries to demonstrate many of the WebXR features to work with VR or AR.

## Components

These are some provided components to aid with the endeavour:

### ar-cursor.js

This file provides the `ar-cursor` component for `clicking` on objects in AR using any
XR input such as tapping on the screen or using an external controller.

Add it to the `<a-scene>` element along with a raycaster and it will use the raycaster to
determine which objects are selected and fire `"click"` events on them.

```html
<a-scene ar-cursor raycaster="objects: #my-objects *">
```

### ar-shadow-helper.js

This file provides the `ar-shadow-helper` component which lets a plane track a particular object
so that it recieves an optimal amount of shadow from a directional light.

This should have an object which can receive a shadow and works well for augmented reality with the
`shader:shadow` material

It also includes `auto-shadow-cam` which controls the orthogonal shadow camera of a directional light
so that the camera covers the minimal area required to fully light an object.

```html
<a-light id="dirlight" auto-shadow-cam intensity="0.4" light="castShadow:true;type:directional" position="10 10 10"></a-light>
    
<a-entity
  material="shader:shadow; depthWrite:false; opacity:0.9;"
  visible="false"
  geometry="primitive:shadow-plane;"
  shadow="cast:false;receive:true;"
  ar-shadow-helper="target:#my-objects;light:#dirlight;"
></a-entity>
```

### model-utils.js

This file provides utilities for modifying 3D models and how they are displayed.

* `exposure="0.5"`, add this to `<a-scene>` to change the exposure of the scene to make it brighter or darker
* `no-tonemapping`, this opts an object out of tone mapping which is useful for using flat materials to look like light sources
* `lightmap="src:#bake;intensity: 10; filter:Window,Ceiling,floor;"`, this lets you use a lightmap on a gltf model, to use it provide the lightmap and optionally constrain the lightmap to certain elements
* `depthwrite`, this lets you overwrite a materials depthwrite property useful in case of weird depth issues on materials with transparency
* `hideparts`, this lets you make certain elements of a gltf object invisible, the better thing to do is to edit the object to remove those parts 

### simple-navmesh-constraint.js

This provides `simple-navmesh-constraint` which allows you to constrain an object to another object,
if you set the `fall` property the object won't fall unless the floor underneath it is within that distance.

This component works by comparing the objects position between frames. Ideally this would run after any movement happen but before it is rendered.
To enable this you should place this component after any components which move the object such as `wasd-controls`.

If the object needs to float off the floor (like the camera) then set the height property and it will stay that far from the ground.

```html
<a-camera wasd-controls="acceleration:20;" simple-navmesh-constraint="navmesh:#navmesh-el;fall:0.5;height:1.65;" look-controls>
```