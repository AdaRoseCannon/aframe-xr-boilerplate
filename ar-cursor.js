/* jshint esversion: 9 */
/* global THREE, AFRAME */
(function() {
  "use strict";
  const direction = new THREE.Vector3();

  AFRAME.registerComponent("ar-cursor", {
    dependencies: ["raycaster"],
    init() {
      const sceneEl = this.el;
      sceneEl.addEventListener("enter-vr", () => {
        if (sceneEl.is("ar-mode")) {
          sceneEl.xrSession.addEventListener("select", this.onselect.bind(this));
        }
      });
    },
    onselect(e) {
      const frame = e.frame;
      const inputSource = e.inputSource;
      const referenceSpace = this.el.renderer.xr.getReferenceSpace();
      const pose = frame.getPose(inputSource.targetRaySpace, referenceSpace);
      if (!pose) return;
      const transform = pose.transform;
      
      direction.set(0, 0, -1);
      direction.applyQuaternion(transform.orientation);
      this.el.setAttribute("raycaster", {
        origin: transform.position,
        direction
      });
      this.el.components.raycaster.checkIntersections();
      const els = this.el.components.raycaster.intersectedEls;
      for (const el of els) {
        const obj = el.object3D;
        let elVisible = obj.visible;
        obj.traverseAncestors(parent => {
          if (parent.visible === false ) {
            elVisible = false
          }
        });
        if (elVisible) {
          
          // Cancel the ar-hit-test behaviours
          this.el.components['ar-hit-test'].hitTest = null;
          this.el.components['ar-hit-test'].bboxMesh.visible = false;
          
          // Emit click on the element for events
          const details = this.el.components.raycaster.getIntersection(el);
          el.emit('click', details);
          
          // Don't go to the next element
          break;
        }
      }
    }
  });
})();