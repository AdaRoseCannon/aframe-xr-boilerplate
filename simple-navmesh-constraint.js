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
    },
    height: {
      default: 1.6
    },
    exclude: {
      default: ''
    }
  },
  
  update: function () {
    this.lastPosition = null;
    this.excludes = this.data.exclude ? Array.from(document.querySelectorAll(this.data.exclude)):[];
    const els = Array.from(document.querySelectorAll(this.data.navmesh));
    if (els === null) {
      console.warn('navmesh-physics: Did not match any elements');
      this.objects = [];
    } else {
      this.objects = els.map(el => el.object3D).concat(this.excludes.map(el => el.object3D));
    }
  },

  tick: (function () {
    const nextPosition = new THREE.Vector3();
    const tempVec = new THREE.Vector3();
    const scanPattern = [
      [0,1], // Default the next location
      [30,0.4], // A little to the side shorter range
      [-30,0.4], // A little to the side shorter range
      [60,0.2], // Moderately to the side short range
      [-60,0.2], // Moderately to the side short range
      [80,0.06], // Perpendicular very short range
      [-80,0.06], // Perpendicular very short range
    ];
    const down = new THREE.Vector3(0,-1,0);
    const raycaster = new THREE.Raycaster();
    const gravity = -1;
    const maxYVelocity = 0.5;
    const results = [];
    let yVel = 0;
    
    return function tick(time, delta) {
      if (this.lastPosition === null) {
        this.lastPosition = new THREE.Vector3();
        this.el.object3D.getWorldPosition(this.lastPosition);
      }
      
      const el = this.el;
      if (this.objects.length === 0) return;

      this.el.object3D.getWorldPosition(nextPosition);
      if (nextPosition.distanceTo(this.lastPosition) === 0) return;
      
      let didHit = false;
      
      // So that it does not get stuck it takes as few samples around the user and finds the most appropriate
      scanPatternLoop:
      for (const [angle, distance] of scanPattern) {
        tempVec.subVectors(nextPosition, this.lastPosition);
        tempVec.applyAxisAngle(down, angle*Math.PI/180);
        tempVec.multiplyScalar(distance);
        tempVec.add(this.lastPosition);
        tempVec.y += maxYVelocity;
        tempVec.y -= this.data.height;
        raycaster.set(tempVec, down);
        raycaster.far = this.data.fall > 0 ? this.data.fall + maxYVelocity : Infinity;
        raycaster.intersectObjects(this.objects, true, results);
        if (results.length) {
          // If it hit something we want to avoid then ignore it and continue
          for (const result of results) {
            if(this.excludes.includes(result.object.el)) continue scanPatternLoop;
          }
          const hitPos = results[0].point;
          hitPos.y += this.data.height;
          if (nextPosition.y - (hitPos.y - yVel*2) > 0.01) {
            yVel += Math.max(gravity * delta * 0.001, -maxYVelocity);
            hitPos.y = nextPosition.y + yVel;
          } else {
            yVel = 0;
          }
          el.object3D.position.copy(hitPos);
          this.el.object3D.parent.worldToLocal(this.el.object3D.position);
          this.lastPosition.copy(hitPos);
          results.splice(0);
          didHit = true;
          break;
        }
        
      }
      
      if (!didHit) {
        this.el.object3D.position.copy(this.lastPosition);
        this.el.object3D.parent.worldToLocal(this.el.object3D.position);
      }
    }
  }())
});
