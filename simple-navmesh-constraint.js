/* global AFRAME, THREE */

/* Constrain an object to a navmesh, for example place this element after wasd-controls like so:
`wasd-controls navmesh-physics="#navmesh-el"`
*/
AFRAME.registerComponent('simple-navmesh-constraint', {
  schema: {
    navmesh: {
      default: ''
    },
    fall: {
      default: 0.5
    }
  },

  init: function () {
    this.lastPosition = new THREE.Vector3();
    this.lastPosition.copy(this.el.object3D.position);
  },
  
  update: function () {
    const els = Array.from(document.querySelectorAll(this.data.navmesh));
    if (els === null) {
      console.warn('navmesh-physics: Did not match any elements');
      this.objects = [];
    } else {
      this.objects = els.map(el => el.object3D);
    }
  },

  tick: (function () {
    var nextPosition = new THREE.Vector3();
    var tempVec = new THREE.Vector3();
    var scanPattern = [
      [0,1], // Default the next location
      [30,0.4], // A little to the side shorter range
      [-30,0.4], // A little to the side shorter range
      [60,0.2], // Moderately to the side short range
      [-60,0.2], // Moderately to the side short range
      [80,0.06], // Perpendicular very short range
      [-80,0.06], // Perpendicular very short range
    ];
    var down = new THREE.Vector3(0,-1,0);
    var raycaster = new THREE.Raycaster();
    var gravity = -1;
    var maxYVelocity = 0.5;
    var yVel = 0;
    var results = [];
    
    return function (time, delta) {
      var el = this.el;
      if (this.objects.length === 0) return;

      // Get movement vector and translate position.
      nextPosition.copy(this.el.object3D.position);
      if (nextPosition.distanceTo(this.lastPosition) === 0) return;
      
      var didHit = false;
      
      // So that it does not get stuck it takes as few samples around the user and finds the most appropriate
      for (const [angle, distance] of scanPattern) {
        tempVec.subVectors(nextPosition, this.lastPosition);
        tempVec.applyAxisAngle(down, angle*Math.PI/180);
        tempVec.multiplyScalar(distance);
        tempVec.add(this.lastPosition);
        tempVec.y += maxYVelocity;
        raycaster.set(tempVec, down);
        raycaster.far = this.data.fall > 0 ? this.data.fall + maxYVelocity : Infinity;
        var intersects = raycaster.intersectObjects(this.objects, true, results);
        if (intersects.length) {
          if (el.object3D.position.y - (intersects[0].point.y - yVel*2) > 0.01) {
            yVel += Math.max(gravity * delta * 0.001, -maxYVelocity);
            intersects[0].point.y = el.object3D.position.y + yVel;
            el.object3D.position.copy(intersects[0].point);
          } else {
            el.object3D.position.copy(intersects[0].point);
            yVel = 0;
          }
          this.lastPosition.copy(this.el.object3D.position);
          results.splice(0);
          didHit = true;
          break;
        }
      }
      
      if (!didHit) this.el.object3D.position.copy(this.lastPosition);
    }
  }())
});
