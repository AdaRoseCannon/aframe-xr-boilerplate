/* jshint esversion: 9 */
/* global THREE, AFRAME */

const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
AFRAME.registerComponent('linear-constraint', {
  schema: {
    axis: {
      type: 'vec3',
      default: {x:0, y:0, z:-1}
    },
    min: {
      default: -Infinity
    },
    max: {
      default: Infinity
    },
    target: {
      type: 'selector'
    },
    part: {
      default: ''
    },
    enabled: {
      default: true
    }
  },
  init() {
    this.tempVec3 = new THREE.Vector3();
    this.n =  new THREE.Vector3();
    this.el.addEventListener('object3dset', this.update.bind(this));
  },
  update () {
    // Ensure the axis is normalized
    this.n.copy(this.data.axis).normalize();
    if (this.data.part) this.part = this.el.object3D.getObjectByName(this.data.part);
  },
  tick() {
    if (!this.data.enabled || !this.data.target) return;
    const object3D = this.data.part ? this.part : this.el.object3D;
    if (!object3D) return;
    if (!this.originalOffset) this.originalOffset = new THREE.Vector3().copy(object3D.position);
    const n = this.n;
    const p0 = this.tempVec3;
    this.data.target.object3D.getWorldPosition(p0);
    object3D.parent.worldToLocal(p0);
    p0.sub(this.originalOffset);
    // We have a plane with normal n that contains p0
    // We want to place the object where a vector n from the origin intersects the plane
    // n.x x + n.y y + n.z z = p0.n
    // Sub in vector equation p=tn
    // t * n.x * n.x + t * n.y * n.y + t * n.z * n.z = p0.n
    // equivalent to  t * n.length() = p0.n
    const t = clamp(p0.dot(n)/n.length() ,this.data.min, this.data.max);
    object3D.position.copy(n).multiplyScalar(t).add(this.originalOffset);
  }
});




AFRAME.registerComponent("attach-to-model", {
  schema: {
    default: ''
  },
  init() {
    this.el.parentNode.addEventListener('object3dset', this.update.bind(this));
  },
  update () {
    if (this.data) this.part = this.el.parentNode.object3D.getObjectByName(this.data);
  },
  tick() {
    if (this.part) {
      const p = this.el.object3D.position;
      this.el.object3D.parent.worldToLocal(this.part.getWorldPosition(p));
    }
  }
});



AFRAME.registerComponent("grab-magnet-target", {
  schema: {
    startEvents: {
      type: 'array'
    },
    stopEvents: {
      type: 'array'
    }
  },
  init() {
    this.grabStart = this.grabStart.bind(this);
    this.grabEnd = this.grabEnd.bind(this);
    this.isGrabbing = false;
    this.oldParent = null;
    this.grabbedEl = null;
    this.oldQuaternion = new THREE.Quaternion();
    this.oldPosition = new THREE.Quaternion();
  },
  update(oldData) {
    if (oldData.startEvents) {
      for (const eventName of oldData.startEvents) {
        this.el.removeEventListener(eventName, this.grabStart);
      }
    }
    if (oldData.stopEvents) {
      for (const eventName of oldData.stopEvents) {
        this.el.removeEventListener(eventName, this.grabEnd);
      }
    }
    for (const eventName of this.data.startEvents) {
      this.el.addEventListener(eventName, this.grabStart);
    }
    for (const eventName of this.data.stopEvents) {
      this.el.addEventListener(eventName, this.grabEnd);
    }
  },
  grabStart() {
    const targetId = this.el.dataset.magnetTarget;
    if (this.isGrabbing === false && targetId) {
      const el = document.getElementById(targetId);
      el.emit('grabbed', {by: this.el});
      this.isGrabbing = true;
      this.grabbedEl = el;
      if (el.dataset.pickUp === undefined) return;
      el.dataset.noMagnet = "";
      this.oldParent = el.parentNode;
      this.el.add(el);
      this.oldQuaternion.copy(el.object3D.quaternion);
      el.object3D.quaternion.identity();
      this.oldPosition.copy(el.object3D.position);
      el.object3D.position.set(0,0,0);
    }
  },
  grabEnd() {
    if (this.isGrabbing) {
      const el = this.grabbedEl;
      el.emit('released', {by: this.el});
      this.isGrabbing = false;
      if (!this.oldParent) return;
      this.oldParent.add(el);
      delete el.dataset.noMagnet;
      this.oldParent = null;
      this.grabbedEl = null;
      el.object3D.quaternion.copy(this.oldQuaternion);
      el.object3D.position.copy(this.oldPosition);
    }
  },
  tick () {
    if (this.isGrabbing) {
      if (this.grabbedEl.dataset.pickUp === undefined && this.el.dataset.magnetTarget !== this.grabbedEl.id){
        this.grabEnd();
      }
    }
  }
});