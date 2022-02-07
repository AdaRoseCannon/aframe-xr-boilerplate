/* global AFRAME, THREE */
(function () {
"use strict";

const bbox = new THREE.Box3();
const normal = new THREE.Vector3();
const cameraWorldPosition = new THREE.Vector3();
const tempMat = new THREE.Matrix4();
const sphere = new THREE.Sphere();
const zeroVector = new THREE.Vector3();
const planeVector = new THREE.Vector3();
const tempVector = new THREE.Vector3();

function distanceOfPointFromPlane(positionOnPlane, planeNormal, p1) {
  // the d value in the plane equation a*x + b*y + c*z=d
	const d = planeNormal.dot(positionOnPlane);

	// distance of point from plane
	return (d - planeNormal.dot(p1))/planeNormal.length();
}

function nearestPointInPlane(positionOnPlane, planeNormal, p1, out) {
  const t = distanceOfPointFromPlane(positionOnPlane, planeNormal, p1);
	// closest point on the plane
	out.copy(planeNormal);
	out.multiplyScalar(t);
	out.add(p1);
	return out;
}

AFRAME.registerGeometry('shadow-plane', {
  schema: {
    width: { default: 1, min: 0 },
    height: { default: 1, min: 0 }
  },

  init: function (data) {
    this.geometry = new THREE.PlaneGeometry(data.width, data.height);
    this.geometry.rotateX(-Math.PI / 2);
  }
});

/**
  Automatically adjust the view frustum to cover the objects in the scene
*/
AFRAME.registerComponent('auto-shadow-cam', {
  schema: {
    targets: {
      type: 'selectorAll',
      default: "[ar-shadow-helper]"
    },
  },
  tick() {
    const camera = this.el.components.light?.light?.shadow?.camera;
    if (!camera || !this.data.targets.length) return;

    camera.getWorldDirection(normal);
    camera.getWorldPosition(cameraWorldPosition);
    tempMat.copy(camera.matrixWorld);
    tempMat.invert();

    camera.near    = 1;
    camera.left    = 100000;
    camera.right   = -100000;
    camera.top     = -100000;
    camera.bottom  = 100000;
    for (const el of this.data.targets) {
      bbox.setFromObject(el.object3D);
      bbox.getBoundingSphere(sphere);
      const distanceToPlane = distanceOfPointFromPlane(cameraWorldPosition, normal, sphere.center);
      const pointOnCameraPlane = nearestPointInPlane(cameraWorldPosition, normal, sphere.center, tempVector);

      const pointInXYPlane = pointOnCameraPlane.applyMatrix4(tempMat);
      camera.near    = Math.min(-distanceToPlane - sphere.radius - 1, camera.near);
      camera.left    = Math.min(-sphere.radius + pointInXYPlane.x, camera.left);
      camera.right   = Math.max( sphere.radius + pointInXYPlane.x, camera.right);
      camera.top     = Math.max( sphere.radius + pointInXYPlane.y, camera.top);
      camera.bottom  = Math.min(-sphere.radius + pointInXYPlane.y, camera.bottom);
    }
    camera.updateProjectionMatrix();
  }
});
  
/**
It also attatches itself to objects and resizes and positions itself to get the most shadow
*/
AFRAME.registerComponent('ar-shadow-helper', {
  schema: {
    target: {
      type: 'selector',
    },
    light: {
      type: 'selector',
      default: 'a-light'
    },
    startVisibleInAR: {
      default: true
    },
    border: {
      default: 0.33
    }
  },
  init: function () {
    var self = this;
    
    this.el.object3D.renderOrder = -1;

    this.el.sceneEl.addEventListener('enter-vr', function () {
      if (self.el.sceneEl.is('ar-mode')) {
        self.el.object3D.visible = self.data.startVisibleInAR;
      }
    });
    this.el.sceneEl.addEventListener('exit-vr', function () {
      self.el.object3D.visible = false;
    });

    this.el.sceneEl.addEventListener('ar-hit-test-select-start', function () {
      // self.el.object3D.visible = false;
    });

    this.el.sceneEl.addEventListener('ar-hit-test-select', function () {
      // self.el.object3D.visible = true;
    });
  },
  tick: function () {

    const obj = this.el.object3D;
    const border = this.data.border;
    const borderWidth = tempVector.set(0,0,0);
    
    // Match the size and rotation of the object
    if (this.data.target) {
      bbox.setFromObject(this.data.target.object3D);
      bbox.getSize(obj.scale);
      borderWidth.copy(obj.scale).multiplyScalar(border);
      obj.scale.multiplyScalar(1 + border*2);
      obj.position.copy(this.data.target.object3D.position);
      obj.quaternion.copy(this.data.target.object3D.quaternion);
    }
    
    // Adjust the plane to get the most shadow
    if (this.data.light) {
      const light = this.data.light;
      const shadow = light.components.light.light.shadow;
    
      if (shadow) {
        const camera = shadow.camera;
        camera.getWorldDirection(normal);
    
        planeVector.set(0,1,0).applyQuaternion(obj.quaternion);
        const projectionOfCameraDirectionOnPlane = nearestPointInPlane(zeroVector, planeVector, normal, planeVector);
        if (
          Math.abs(projectionOfCameraDirectionOnPlane.x) > 0.01 ||
          Math.abs(projectionOfCameraDirectionOnPlane.y) > 0.01 ||
          Math.abs(projectionOfCameraDirectionOnPlane.z) > 0.01
        ) {
          projectionOfCameraDirectionOnPlane.normalize().multiply(borderWidth);
          obj.position.add(projectionOfCameraDirectionOnPlane);
        }
      }
    }
  }
});
}());
