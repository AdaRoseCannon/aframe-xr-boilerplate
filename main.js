/* jshint esversion: 9 */
/* global THREE, AFRAME */

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

window.addEventListener("DOMContentLoaded", function() {
  const sceneEl = document.querySelector("a-scene");
  const message = document.getElementById("dom-overlay-message");
  
  sceneEl.addEventListener('object3dset', function () {
    if (this.components && this.components.reflection) this.components.reflection.needsVREnvironmentUpdate = true;
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
              // side: THREE.DoubleSide,
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