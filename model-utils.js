/* global AFRAME, THREE */

/* Constrain wasd-controls to a navmesh, place this element after wasd-controls like so:
`wasd-controls navmesh-physics="#navmesh-el"`
*/
AFRAME.registerComponent('navmesh-physics', {
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

AFRAME.registerComponent('lightmap', {
  schema: {
    src: {
      type: "map"
    },
    intensity: {
      default: 1
    },
    filter: {
      default: ''
    },
    basis: {
      default: false
    }
  },
  init() {
    
    const src = typeof this.data.src === 'string' ? this.data.src : this.data.src.src;
    const texture = new THREE.TextureLoader().load(src);
    texture.flipY = false;
    this.texture = texture;

    this.el.addEventListener('object3dset', this.update.bind(this));
    this.materials = new Map();
  },
  update() {
    const filters = this.data.filter.trim().split(',');
    this.el.object3D.traverse(function (o) {
      if (o.material) {
        if (filters.some(filter => o.material.name.includes(filter))) {
          const sceneEl = this.el.sceneEl;
          const m = o.material;
          o.material = this.materials.has(m) ? this.materials.get(m) : new THREE.MeshPhongMaterial({
            name: 'phong_' + m.name,
            lightMap: this.texture,
            lightMapIntensity: this.data.intensity,
            color: m.color,
            map: m.map,
            transparent: m.transparent,
            side: m.side,
            depthWrite: m.depthWrite,
            reflectivity: m.metalness,
            toneMapped: m.toneMapped,
            get envMap() {return sceneEl.object3D.environment}
          });
          
          this.materials.set(m, o.material);
        }
      }
    }.bind(this));
  }
});

AFRAME.registerComponent('depthwrite', {
  schema: {
    default: true
  },
  init() {
    this.el.addEventListener('object3dset', this.update.bind(this));
  },
  update() {
    this.el.object3D.traverse(function (o) {
      if (o.material) {
        o.material.depthWrite = this.data;
      }
    }.bind(this));
  }
});

AFRAME.registerComponent('hideparts', {
  schema: {
    default: ""
  },
  init() {
    this.el.addEventListener('object3dset', this.update.bind(this));
  },
  update() {
    const filter = this.data.split(',');
    this.el.object3D.traverse(function (o) {
      if (o.type === 'Mesh' && filter.includes(o.name)) {
        o.visible = false;
      }
    }.bind(this));
  }
});

AFRAME.registerSystem('exposure', {
  schema: {
    default: 0.5
  },
  init () {
    const renderer = this.el.renderer;
    renderer.physicallyCorrectLights = true;
    renderer.logarithmicDepthBuffer = true;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = this.data;
  }
})

AFRAME.registerComponent('no-tonemapping', {
  schema: {
    default: ''
  },
  init() {
    this.el.addEventListener('object3dset', this.update.bind(this));
  },
  update() {
    const filters = this.data.trim().split(',');
    this.el.object3D.traverse(function (o) {
      if (o.material) {
        if (filters.some(filter => o.material.name.includes(filter))) {
          o.material.toneMapped = false;
        }
      }
    }.bind(this));
  }
});