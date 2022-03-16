/* jshint esversion: 9 */
/* global THREE, AFRAME, Ammo */

AFRAME.registerComponent("hide-on-hit-test-start", {
  init: function() {
    var self = this;
    this.el.sceneEl.addEventListener("ar-hit-test-start", function() {
      self.el.object3D.visible = false;
    });
    this.el.sceneEl.addEventListener("exit-vr", function() {
      self.el.object3D.visible = true;
    });
  }
});

AFRAME.registerComponent("origin-on-ar-start", {
  init: function() {
    var self = this.el;

    this.el.sceneEl.addEventListener("enter-vr", function() {
      if (this.is("ar-mode")) {
        self.setAttribute('position', {x:0,y:0,z:0});
        self.setAttribute('rotation', {x:0,y:0,z:0});
      }
    });
  }
});

AFRAME.registerComponent("xr-follow", {
  schema: {},
  init() {
  },
  tick() {
    const scene = this.el.sceneEl;
    const cameraObject = scene.camera;
    const camera = scene.is('vr-mode') ? scene.renderer.xr.getCamera(cameraObject) : cameraObject;
    const object3D = this.el.object3D;
    camera.getWorldPosition(object3D.position);
    object3D.parent.worldToLocal(object3D.position);
  }
});

AFRAME.registerComponent("exit-on", {
  schema: {
    default: 'click'
  },
  update(oldEvent) {
    const newEvent = this.data;
    this.el.removeEventListener(oldEvent, this.exitVR);
    this.el.addEventListener(newEvent, this.exitVR);
  },
  exitVR() {
    this.sceneEl.exitVR();
  }
});

AFRAME.registerComponent("ammo-shape-from-model", {
  schema: {
    type: 'string',
    default: ''
  },
  init () {
    const details = this.data;
    this.onLoad = function () {
      this.setAttribute('ammo-shape', details);
      this.removeAttribute('ammo-shape-from-model');
    }
    this.el.addEventListener('object3dset', this.onLoad);
  },
  remove () {
    this.el.removeEventListener('object3dset', this.onLoad);
  }
});
AFRAME.registerComponent("ammo-body-from-model", {
  schema: {
    type: 'string',
    default: ''
  },
  init () {
    const details = this.data;
    this.onLoad = function () {
      this.setAttribute('ammo-body', details);
      this.removeAttribute('ammo-body-from-model');
    }
    this.el.addEventListener('object3dset', this.onLoad);
  },
  remove () {
    this.el.removeEventListener('object3dset', this.onLoad);
  }
});


AFRAME.registerComponent("toggle-physics", {
  init () {
    this.onPickup = function () { this.setAttribute('ammo-body', 'type', 'kinematic'); }
    this.onPutDown = function (e) {
      this.setAttribute('ammo-body', 'type', 'dynamic');
      if (e.detail.frame && e.detail.inputSource) {
        const pose = e.detail.frame.getPose(e.detail.inputSource.gripSpace);
        if (pose.angularVelocity) {
          const velocity = new Ammo.btVector3(pose.angularVelocity.x,pose.angularVelocity.y,pose.angularVelocity.z);
          this.el.body.setAngularVelocity(velocity);
          Ammo.destroy(velocity);
        }
        if (pose.linearVelocity) {
          const velocity = new Ammo.btVector3(pose.linearVelocity.x,pose.linearVelocity.y,pose.linearVelocity.z);
          this.el.body.setLinearVelocity(velocity);
          Ammo.destroy(velocity);
        }
      }
    }
    this.el.addEventListener('pickup', this.onPickup);
    this.el.addEventListener('putdown', this.onPutDown);
  },
  remove () {
    this.el.removeEventListener('pickup', this.onPickup);
    this.el.removeEventListener('putdown', this.onPutDown);
  }
});

window.addEventListener("DOMContentLoaded", function() {
  const sceneEl = document.querySelector("a-scene");
  const message = document.getElementById("dom-overlay-message");
  const arContainerEl = document.getElementById("my-ar-objects");
  const cameraRig = document.getElementById("cameraRig");
  const building = document.getElementById("building");
  
  building.addEventListener('object3dset', function () {
    if (this.components && this.components.reflection) this.components.reflection.needsVREnvironmentUpdate = true;
  }, {once: true});
  
  const labels = Array.from(document.querySelectorAll('.pose-label'));
  for (const el of labels) {
    el.parentNode.addEventListener('pose', function (event) {
      el.setAttribute('text', 'value', event.detail.pose);
    });
    el.parentNode.addEventListener('gamepad', function (event) {
      el.setAttribute('text', 'value', event.detail.event);
    });
  }
  
  const watergun = document.getElementById("watergun");
  const watergunSlider = watergun.firstElementChild;
  watergun.addEventListener('grabbed', function (e) {
    const by = e.detail.by;
    if (e.target === watergun) {
      if (by.dataset.right) watergunSlider.className = 'magnet-left';
      if (by.dataset.left) watergunSlider.className = 'magnet-right';
    }
    if (e.target === watergunSlider) {
      if (by.dataset.right) watergun.setAttribute('linear-constraint', 'target', '#right-no-magnet');
      if (by.dataset.left) watergun.setAttribute('linear-constraint', 'target', '#left-no-magnet');
    }
  });
  watergun.addEventListener('released', function (e) {
    const by = e.detail.by;
    if (e.target === watergun) {
      watergunSlider.className = '';
      watergun.setAttribute('linear-constraint', 'target', '');
    }
    if (e.target === watergunSlider) {
      watergun.setAttribute('linear-constraint', 'target', '');
    }
  });

  // If the user taps on any buttons or interactive elements we may add then prevent
  // Any WebXR select events from firing
  message.addEventListener("beforexrselect", e => {
    e.preventDefault();
  });

  sceneEl.addEventListener("enter-vr", function() {
    if (this.is("ar-mode")) {
      // Entered AR
      message.textContent = "";

      // Hit testing is available
      this.addEventListener(
        "ar-hit-test-start",
        function() {
          message.innerHTML = `Scanning environment, finding surface.`;
        },
        { once: true }
      );

      // Has managed to start doing hit testing
      this.addEventListener(
        "ar-hit-test-achieved",
        function() {
          message.innerHTML = `Select the location to place<br />By tapping on the screen or selecting with your controller.`;
        },
        { once: true }
      );

      // User has placed an object
      this.addEventListener(
        "ar-hit-test-select",
        function() {
          // Object placed for the first time
          message.textContent = "Well done!";
        },
        { once: true }
      );
    }
  });

  sceneEl.addEventListener("exit-vr", function() {
    message.textContent = "Exited Immersive Mode";
  });
});

AFRAME.registerComponent('window-replace', {
  schema: {
    default: ''
  },
  init() {
    this.el.addEventListener('object3dset', this.update.bind(this));
    this.materials = new Map();
  },
  update() {
    const filters = this.data.trim().split(',');
    this.el.object3D.traverse(function (o) {
      if (o.material) {
        if (filters.some(filter => o.material.name.includes(filter))) {
          o.renderOrder = 1;
          const m = o.material;
          const sceneEl = this.el.sceneEl;
          o.material = this.materials.has(m) ?
            this.materials.get(m) :
            new THREE.MeshPhongMaterial({
              name: 'window_' + m.name,
              lightMap: m.lightmap || null,
              lightMapIntensity: m.lightMapIntensity,
              shininess: 90,
              color: '#ffffff',
              emissive: '#999999',
              emissiveMap: m.map,
              transparent: true,
              depthWrite: false,
              map: m.map,
              transparent: true,
              side: THREE.DoubleSide,
              get envMap() {return sceneEl.object3D.environment},
              combine: THREE.MixOperation,
              reflectivity: 0.6,
              blending: THREE.CustomBlending,
              blendEquation: THREE.MaxEquation,
              toneMapped: m.toneMapped
            });
          ;
          window.mat = o.material;
          this.materials.set(m, o.material);
        }
      }
    }.bind(this));
  }
});