/* global AFRAME, THREE */

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