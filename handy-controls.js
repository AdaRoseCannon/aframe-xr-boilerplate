(function () {
  'use strict';

  /**
   * @webxr-input-profiles/motion-controllers 1.0.0 https://github.com/immersive-web/webxr-input-profiles
   */

  const Constants = {
    Handedness: Object.freeze({
      NONE: 'none',
      LEFT: 'left',
      RIGHT: 'right'
    }),

    ComponentState: Object.freeze({
      DEFAULT: 'default',
      TOUCHED: 'touched',
      PRESSED: 'pressed'
    }),

    ComponentProperty: Object.freeze({
      BUTTON: 'button',
      X_AXIS: 'xAxis',
      Y_AXIS: 'yAxis',
      STATE: 'state'
    }),

    ComponentType: Object.freeze({
      TRIGGER: 'trigger',
      SQUEEZE: 'squeeze',
      TOUCHPAD: 'touchpad',
      THUMBSTICK: 'thumbstick',
      BUTTON: 'button'
    }),

    ButtonTouchThreshold: 0.05,

    AxisTouchThreshold: 0.1,

    VisualResponseProperty: Object.freeze({
      TRANSFORM: 'transform',
      VISIBILITY: 'visibility'
    })
  };

  /**
   * @description Static helper function to fetch a JSON file and turn it into a JS object
   * @param {string} path - Path to JSON file to be fetched
   */
  async function fetchJsonFile(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(response.statusText);
    } else {
      return response.json();
    }
  }

  async function fetchProfilesList(basePath) {
    if (!basePath) {
      throw new Error('No basePath supplied');
    }

    const profileListFileName = 'profilesList.json';
    const profilesList = await fetchJsonFile(`${basePath}/${profileListFileName}`);
    return profilesList;
  }

  async function fetchProfile(xrInputSource, basePath, defaultProfile = null, getAssetPath = true) {
    if (!xrInputSource) {
      throw new Error('No xrInputSource supplied');
    }

    if (!basePath) {
      throw new Error('No basePath supplied');
    }

    // Get the list of profiles
    const supportedProfilesList = await fetchProfilesList(basePath);

    // Find the relative path to the first requested profile that is recognized
    let match;
    xrInputSource.profiles.some((profileId) => {
      const supportedProfile = supportedProfilesList[profileId];
      if (supportedProfile) {
        match = {
          profileId,
          profilePath: `${basePath}/${supportedProfile.path}`,
          deprecated: !!supportedProfile.deprecated
        };
      }
      return !!match;
    });

    if (!match) {
      if (!defaultProfile) {
        throw new Error('No matching profile name found');
      }

      const supportedProfile = supportedProfilesList[defaultProfile];
      if (!supportedProfile) {
        throw new Error(`No matching profile name found and default profile "${defaultProfile}" missing.`);
      }

      match = {
        profileId: defaultProfile,
        profilePath: `${basePath}/${supportedProfile.path}`,
        deprecated: !!supportedProfile.deprecated
      };
    }

    const profile = await fetchJsonFile(match.profilePath);

    let assetPath;
    if (getAssetPath) {
      let layout;
      if (xrInputSource.handedness === 'any') {
        layout = profile.layouts[Object.keys(profile.layouts)[0]];
      } else {
        layout = profile.layouts[xrInputSource.handedness];
      }
      if (!layout) {
        throw new Error(
          `No matching handedness, ${xrInputSource.handedness}, in profile ${match.profileId}`
        );
      }

      if (layout.assetPath) {
        assetPath = match.profilePath.replace('profile.json', layout.assetPath);
      }
    }

    return { profile, assetPath };
  }

  /** @constant {Object} */
  const defaultComponentValues = {
    xAxis: 0,
    yAxis: 0,
    button: 0,
    state: Constants.ComponentState.DEFAULT
  };

  /**
   * @description Converts an X, Y coordinate from the range -1 to 1 (as reported by the Gamepad
   * API) to the range 0 to 1 (for interpolation). Also caps the X, Y values to be bounded within
   * a circle. This ensures that thumbsticks are not animated outside the bounds of their physical
   * range of motion and touchpads do not report touch locations off their physical bounds.
   * @param {number} x The original x coordinate in the range -1 to 1
   * @param {number} y The original y coordinate in the range -1 to 1
   */
  function normalizeAxes(x = 0, y = 0) {
    let xAxis = x;
    let yAxis = y;

    // Determine if the point is outside the bounds of the circle
    // and, if so, place it on the edge of the circle
    const hypotenuse = Math.sqrt((x * x) + (y * y));
    if (hypotenuse > 1) {
      const theta = Math.atan2(y, x);
      xAxis = Math.cos(theta);
      yAxis = Math.sin(theta);
    }

    // Scale and move the circle so values are in the interpolation range.  The circle's origin moves
    // from (0, 0) to (0.5, 0.5). The circle's radius scales from 1 to be 0.5.
    const result = {
      normalizedXAxis: (xAxis * 0.5) + 0.5,
      normalizedYAxis: (yAxis * 0.5) + 0.5
    };
    return result;
  }

  /**
   * Contains the description of how the 3D model should visually respond to a specific user input.
   * This is accomplished by initializing the object with the name of a node in the 3D model and
   * property that need to be modified in response to user input, the name of the nodes representing
   * the allowable range of motion, and the name of the input which triggers the change. In response
   * to the named input changing, this object computes the appropriate weighting to use for
   * interpolating between the range of motion nodes.
   */
  class VisualResponse {
    constructor(visualResponseDescription) {
      this.componentProperty = visualResponseDescription.componentProperty;
      this.states = visualResponseDescription.states;
      this.valueNodeName = visualResponseDescription.valueNodeName;
      this.valueNodeProperty = visualResponseDescription.valueNodeProperty;

      if (this.valueNodeProperty === Constants.VisualResponseProperty.TRANSFORM) {
        this.minNodeName = visualResponseDescription.minNodeName;
        this.maxNodeName = visualResponseDescription.maxNodeName;
      }

      // Initializes the response's current value based on default data
      this.value = 0;
      this.updateFromComponent(defaultComponentValues);
    }

    /**
     * Computes the visual response's interpolation weight based on component state
     * @param {Object} componentValues - The component from which to update
     * @param {number} xAxis - The reported X axis value of the component
     * @param {number} yAxis - The reported Y axis value of the component
     * @param {number} button - The reported value of the component's button
     * @param {string} state - The component's active state
     */
    updateFromComponent({
      xAxis, yAxis, button, state
    }) {
      const { normalizedXAxis, normalizedYAxis } = normalizeAxes(xAxis, yAxis);
      switch (this.componentProperty) {
        case Constants.ComponentProperty.X_AXIS:
          this.value = (this.states.includes(state)) ? normalizedXAxis : 0.5;
          break;
        case Constants.ComponentProperty.Y_AXIS:
          this.value = (this.states.includes(state)) ? normalizedYAxis : 0.5;
          break;
        case Constants.ComponentProperty.BUTTON:
          this.value = (this.states.includes(state)) ? button : 0;
          break;
        case Constants.ComponentProperty.STATE:
          if (this.valueNodeProperty === Constants.VisualResponseProperty.VISIBILITY) {
            this.value = (this.states.includes(state));
          } else {
            this.value = this.states.includes(state) ? 1.0 : 0.0;
          }
          break;
        default:
          throw new Error(`Unexpected visualResponse componentProperty ${this.componentProperty}`);
      }
    }
  }

  class Component {
    /**
     * @param {Object} componentId - Id of the component
     * @param {Object} componentDescription - Description of the component to be created
     */
    constructor(componentId, componentDescription) {
      if (!componentId
       || !componentDescription
       || !componentDescription.visualResponses
       || !componentDescription.gamepadIndices
       || Object.keys(componentDescription.gamepadIndices).length === 0) {
        throw new Error('Invalid arguments supplied');
      }

      this.id = componentId;
      this.type = componentDescription.type;
      this.rootNodeName = componentDescription.rootNodeName;
      this.touchPointNodeName = componentDescription.touchPointNodeName;

      // Build all the visual responses for this component
      this.visualResponses = {};
      Object.keys(componentDescription.visualResponses).forEach((responseName) => {
        const visualResponse = new VisualResponse(componentDescription.visualResponses[responseName]);
        this.visualResponses[responseName] = visualResponse;
      });

      // Set default values
      this.gamepadIndices = Object.assign({}, componentDescription.gamepadIndices);

      this.values = {
        state: Constants.ComponentState.DEFAULT,
        button: (this.gamepadIndices.button !== undefined) ? 0 : undefined,
        xAxis: (this.gamepadIndices.xAxis !== undefined) ? 0 : undefined,
        yAxis: (this.gamepadIndices.yAxis !== undefined) ? 0 : undefined
      };
    }

    get data() {
      const data = { id: this.id, ...this.values };
      return data;
    }

    /**
     * @description Poll for updated data based on current gamepad state
     * @param {Object} gamepad - The gamepad object from which the component data should be polled
     */
    updateFromGamepad(gamepad) {
      // Set the state to default before processing other data sources
      this.values.state = Constants.ComponentState.DEFAULT;

      // Get and normalize button
      if (this.gamepadIndices.button !== undefined
          && gamepad.buttons.length > this.gamepadIndices.button) {
        const gamepadButton = gamepad.buttons[this.gamepadIndices.button];
        this.values.button = gamepadButton.value;
        this.values.button = (this.values.button < 0) ? 0 : this.values.button;
        this.values.button = (this.values.button > 1) ? 1 : this.values.button;

        // Set the state based on the button
        if (gamepadButton.pressed || this.values.button === 1) {
          this.values.state = Constants.ComponentState.PRESSED;
        } else if (gamepadButton.touched || this.values.button > Constants.ButtonTouchThreshold) {
          this.values.state = Constants.ComponentState.TOUCHED;
        }
      }

      // Get and normalize x axis value
      if (this.gamepadIndices.xAxis !== undefined
          && gamepad.axes.length > this.gamepadIndices.xAxis) {
        this.values.xAxis = gamepad.axes[this.gamepadIndices.xAxis];
        this.values.xAxis = (this.values.xAxis < -1) ? -1 : this.values.xAxis;
        this.values.xAxis = (this.values.xAxis > 1) ? 1 : this.values.xAxis;

        // If the state is still default, check if the xAxis makes it touched
        if (this.values.state === Constants.ComponentState.DEFAULT
          && Math.abs(this.values.xAxis) > Constants.AxisTouchThreshold) {
          this.values.state = Constants.ComponentState.TOUCHED;
        }
      }

      // Get and normalize Y axis value
      if (this.gamepadIndices.yAxis !== undefined
          && gamepad.axes.length > this.gamepadIndices.yAxis) {
        this.values.yAxis = gamepad.axes[this.gamepadIndices.yAxis];
        this.values.yAxis = (this.values.yAxis < -1) ? -1 : this.values.yAxis;
        this.values.yAxis = (this.values.yAxis > 1) ? 1 : this.values.yAxis;

        // If the state is still default, check if the yAxis makes it touched
        if (this.values.state === Constants.ComponentState.DEFAULT
          && Math.abs(this.values.yAxis) > Constants.AxisTouchThreshold) {
          this.values.state = Constants.ComponentState.TOUCHED;
        }
      }

      // Update the visual response weights based on the current component data
      Object.values(this.visualResponses).forEach((visualResponse) => {
        visualResponse.updateFromComponent(this.values);
      });
    }
  }

  /**
    * @description Builds a motion controller with components and visual responses based on the
    * supplied profile description. Data is polled from the xrInputSource's gamepad.
    * @author Nell Waliczek / https://github.com/NellWaliczek
  */
  class MotionController {
    /**
     * @param {Object} xrInputSource - The XRInputSource to build the MotionController around
     * @param {Object} profile - The best matched profile description for the supplied xrInputSource
     * @param {Object} assetUrl
     */
    constructor(xrInputSource, profile, assetUrl) {
      if (!xrInputSource) {
        throw new Error('No xrInputSource supplied');
      }

      if (!profile) {
        throw new Error('No profile supplied');
      }

      this.xrInputSource = xrInputSource;
      this.assetUrl = assetUrl;
      this.id = profile.profileId;

      // Build child components as described in the profile description
      this.layoutDescription = profile.layouts[xrInputSource.handedness];
      this.components = {};
      Object.keys(this.layoutDescription.components).forEach((componentId) => {
        const componentDescription = this.layoutDescription.components[componentId];
        this.components[componentId] = new Component(componentId, componentDescription);
      });

      // Initialize components based on current gamepad state
      this.updateFromGamepad();
    }

    get gripSpace() {
      return this.xrInputSource.gripSpace;
    }

    get targetRaySpace() {
      return this.xrInputSource.targetRaySpace;
    }

    /**
     * @description Returns a subset of component data for simplified debugging
     */
    get data() {
      const data = [];
      Object.values(this.components).forEach((component) => {
        data.push(component.data);
      });
      return data;
    }

    /**
     * @description Poll for updated data based on current gamepad state
     */
    updateFromGamepad() {
      Object.values(this.components).forEach((component) => {
        component.updateFromGamepad(this.xrInputSource.gamepad);
      });
    }
  }

  /* global THREE */
  const {
  	Mesh,
  	MeshBasicMaterial,
  	Object3D,
  	SphereGeometry,
  } = THREE;

  const DEFAULT_PROFILES_PATH$1 = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets/dist/profiles';
  const DEFAULT_PROFILE = 'generic-trigger';

  class XRControllerModel extends Object3D {

  	constructor() {

  		super();

  		this.motionController = null;
  		this.envMap = null;

  	}

  	setEnvironmentMap( envMap ) {

  		if ( this.envMap == envMap ) {

  			return this;

  		}

  		this.envMap = envMap;
  		this.traverse( ( child ) => {

  			if ( child.isMesh ) {

  				child.material.envMap = this.envMap;
  				child.material.needsUpdate = true;

  			}

  		} );

  		return this;

  	}

  	/**
  	 * Polls data from the XRInputSource and updates the model's components to match
  	 * the real world data
  	 */
  	updateMatrixWorld( force ) {

  		super.updateMatrixWorld( force );

  		if ( ! this.motionController ) return;

  		// Cause the MotionController to poll the Gamepad for data
  		this.motionController.updateFromGamepad();

  		// Update the 3D model to reflect the button, thumbstick, and touchpad state
  		Object.values( this.motionController.components ).forEach( ( component ) => {

  			// Update node data based on the visual responses' current states
  			Object.values( component.visualResponses ).forEach( ( visualResponse ) => {

  				const { valueNode, minNode, maxNode, value, valueNodeProperty } = visualResponse;

  				// Skip if the visual response node is not found. No error is needed,
  				// because it will have been reported at load time.
  				if ( ! valueNode ) return;

  				// Calculate the new properties based on the weight supplied
  				if ( valueNodeProperty === Constants.VisualResponseProperty.VISIBILITY ) {

  					valueNode.visible = value;

  				} else if ( valueNodeProperty === Constants.VisualResponseProperty.TRANSFORM ) {

  					valueNode.quaternion.slerpQuaternions(
  						minNode.quaternion,
  						maxNode.quaternion,
  						value
  					);

  					valueNode.position.lerpVectors(
  						minNode.position,
  						maxNode.position,
  						value
  					);

  				}

  			} );

  		} );

  	}

  }

  /**
   * Walks the model's tree to find the nodes needed to animate the components and
   * saves them to the motionContoller components for use in the frame loop. When
   * touchpads are found, attaches a touch dot to them.
   */
  function findNodes( motionController, scene ) {

  	// Loop through the components and find the nodes needed for each components' visual responses
  	Object.values( motionController.components ).forEach( ( component ) => {

  		const { type, touchPointNodeName, visualResponses } = component;

  		if ( type === Constants.ComponentType.TOUCHPAD ) {

  			component.touchPointNode = scene.getObjectByName( touchPointNodeName );
  			if ( component.touchPointNode ) {

  				// Attach a touch dot to the touchpad.
  				const sphereGeometry = new SphereGeometry( 0.001 );
  				const material = new MeshBasicMaterial( { color: 0x0000FF } );
  				const sphere = new Mesh( sphereGeometry, material );
  				component.touchPointNode.add( sphere );

  			} else {

  				console.warn( `Could not find touch dot, ${component.touchPointNodeName}, in touchpad component ${component.id}` );

  			}

  		}

  		// Loop through all the visual responses to be applied to this component
  		Object.values( visualResponses ).forEach( ( visualResponse ) => {

  			const { valueNodeName, minNodeName, maxNodeName, valueNodeProperty } = visualResponse;

  			// If animating a transform, find the two nodes to be interpolated between.
  			if ( valueNodeProperty === Constants.VisualResponseProperty.TRANSFORM ) {

  				visualResponse.minNode = scene.getObjectByName( minNodeName );
  				visualResponse.maxNode = scene.getObjectByName( maxNodeName );

  				// If the extents cannot be found, skip this animation
  				if ( ! visualResponse.minNode ) {

  					console.warn( `Could not find ${minNodeName} in the model` );
  					return;

  				}

  				if ( ! visualResponse.maxNode ) {

  					console.warn( `Could not find ${maxNodeName} in the model` );
  					return;

  				}

  			}

  			// If the target node cannot be found, skip this animation
  			visualResponse.valueNode = scene.getObjectByName( valueNodeName );
  			if ( ! visualResponse.valueNode ) {

  				console.warn( `Could not find ${valueNodeName} in the model` );

  			}

  		} );

  	} );

  }

  function addAssetSceneToControllerModel( controllerModel, scene ) {

  	// Find the nodes needed for animation and cache them on the motionController.
  	findNodes( controllerModel.motionController, scene );

  	// Apply any environment map that the mesh already has set.
  	if ( controllerModel.envMap ) {

  		scene.traverse( ( child ) => {

  			if ( child.isMesh ) {

  				child.material.envMap = controllerModel.envMap;
  				child.material.needsUpdate = true;

  			}

  		} );

  	}

  	// Add the glTF scene to the controllerModel.
  	controllerModel.add( scene );

  }

  class XRControllerModelFactory {

  	constructor( gltfLoader, path ) {

  		this.gltfLoader = gltfLoader;
  		this.path = path || DEFAULT_PROFILES_PATH$1;
  		this._assetCache = {};

  	}

  	createControllerModel( controller ) {

  		const controllerModel = new XRControllerModel();
  		let scene = null;

  		controller.addEventListener( 'connected', ( event ) => {

  			const xrInputSource = event.data;

  			if ( xrInputSource.targetRayMode !== 'tracked-pointer' || ! xrInputSource.gamepad ) return;

  			fetchProfile( xrInputSource, this.path, DEFAULT_PROFILE ).then( ( { profile, assetPath } ) => {

  				controllerModel.motionController = new MotionController(
  					xrInputSource,
  					profile,
  					assetPath
  				);

  				const buttons = [];
  				const axes = [];
  				const gamepadMappings = { buttons, axes };
  				controllerModel.gamepadMappings = gamepadMappings;

  				if (controllerModel.motionController.layoutDescription?.components) {
  					for (let [name, details] of Object.entries(controllerModel.motionController.layoutDescription.components)) {
  						name = name.replace('xr-standard-', '');
  						for (const [type, index] of Object.entries(details.gamepadIndices)) {
  							if (type === 'button') {
  								buttons[index] = name;
  							} else {
  								axes[index] = {name,type};
  							}
  						}
  					}
  				}

  				const cachedAsset = this._assetCache[ controllerModel.motionController.assetUrl ];
  				if ( cachedAsset ) {

  					scene = cachedAsset.scene.clone();

  					addAssetSceneToControllerModel( controllerModel, scene );

  				} else {

  					if ( ! this.gltfLoader ) {

  						throw new Error( 'GLTFLoader not set.' );

  					}

  					this.gltfLoader.setPath( '' );
  					this.gltfLoader.load( controllerModel.motionController.assetUrl, ( asset ) => {

  						this._assetCache[ controllerModel.motionController.assetUrl ] = asset;

  						scene = asset.scene.clone();

  						addAssetSceneToControllerModel( controllerModel, scene );

  					},
  					null,
  					() => {

  						throw new Error( `Asset ${controllerModel.motionController.assetUrl} missing or malformed.` );

  					} );

  				}

  			} ).catch( ( err ) => {

  				console.warn( err );

  			} );

  		} );

  		controller.addEventListener( 'disconnected', () => {

  			controllerModel.motionController = null;
  			controllerModel.remove( scene );
  			scene = null;

  		} );

  		return controllerModel;

  	}

  }

  /* global AFRAME, THREE */
  const DEFAULT_PROFILES_PATH = "https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets/dist/profiles";
  const DEFAULT_HAND_PROFILE_PATH = DEFAULT_PROFILES_PATH + "/generic-hand";
  const LIB_URL = "https://cdn.jsdelivr.net/npm/handy-work" + ('@' + "2.3.0" );
  const LIB = LIB_URL + "/build/esm/handy-work.standalone.js";
  const POSE_FOLDER = LIB_URL + "/poses/";
  const clamp = (a, min = 0, max = 1) => Math.min(max, Math.max(min, a));
  const invlerp = (x, y, a) => clamp((a - x) / (y - x));
  const prevGamePads = new Map();
  const changedAxes = new Set();

  const tempVector3_A = new THREE.Vector3();
  const tempVector3_B = new THREE.Vector3();
  const tempQuaternion_A = new THREE.Quaternion();
  const tempQuaternion_B = new THREE.Quaternion();
  const tempQuaternion_C = new THREE.Quaternion();
  const handednesses = ['left', 'right', 'none'];

  const joints = [
    "wrist",
    "thumb-metacarpal",
    "thumb-phalanx-proximal",
    "thumb-phalanx-distal",
    "thumb-tip",
    "index-finger-metacarpal",
    "index-finger-phalanx-proximal",
    "index-finger-phalanx-intermediate",
    "index-finger-phalanx-distal",
    "index-finger-tip",
    "middle-finger-metacarpal",
    "middle-finger-phalanx-proximal",
    "middle-finger-phalanx-intermediate",
    "middle-finger-phalanx-distal",
    "middle-finger-tip",
    "ring-finger-metacarpal",
    "ring-finger-phalanx-proximal",
    "ring-finger-phalanx-intermediate",
    "ring-finger-phalanx-distal",
    "ring-finger-tip",
    "pinky-finger-metacarpal",
    "pinky-finger-phalanx-proximal",
    "pinky-finger-phalanx-intermediate",
    "pinky-finger-phalanx-distal",
    "pinky-finger-tip",
  ];

  AFRAME.registerComponent("handy-controls", {
    schema: {
      renderGamepad: {
        oneOf: ['any', 'left', 'right', 'none', 'never'],
        default: 'any',
        description: `Whether to render a gamepad model when it's not doing hand tracking, right, none and left are the names of controller handedness, any is all of them, and never is to not draw gamepads`
      },
      left: {
        description: 'URL for left controller',
        type: 'model',
        default: DEFAULT_HAND_PROFILE_PATH + "/left.glb",
      },
      right: {
        description: 'URL for right controller',
        type: 'model',
        default: DEFAULT_HAND_PROFILE_PATH + "/right.glb",
      },
      materialOverride: {
        description: 'Which hand to use the `material` component for',
        oneOf: ['both', 'left', 'right', 'neither'],
        default: 'both'
      },
      fuseVShort: {
        description: 'Time for a pose to trigger a pose event (ms)',
        default:48
      },
      fuseShort: {
        description: 'Time for a pose to trigger a pose_fuseShort event (ms)',
        default:480
      },
      fuseLong: {
        description: 'Time for a pose to trigger a pose_fuseLong event (ms)',
        default:1440
      }
    },
    init() {
      const sceneEl = this.el.sceneEl;

      this.handyWorkCallback = this.handyWorkCallback.bind(this);
      
      const webxrData = this.el.sceneEl.getAttribute('webxr');
      const optionalFeaturesArray = webxrData.optionalFeatures;
      if (!optionalFeaturesArray.includes('hand-tracking')) {
        optionalFeaturesArray.push('hand-tracking');
        this.el.sceneEl.setAttribute('webxr', webxrData);
      }
      
      this.loader = new THREE.GLTFLoader();
      const self = this;
      const dracoLoader = this.el.sceneEl.systems['gltf-model'].getDRACOLoader();
      const meshoptDecoder = this.el.sceneEl.systems['gltf-model'].getMeshoptDecoder();
      this.controllerModelFactory = new XRControllerModelFactory(this.loader, DEFAULT_PROFILES_PATH);
      this.model = null;
      if (dracoLoader) {
        this.loader.setDRACOLoader(dracoLoader);
      }
      if (meshoptDecoder) {
        this.ready = meshoptDecoder.then(function (meshoptDecoder) {
          self.loader.setMeshoptDecoder(meshoptDecoder);
        });
      } else {
        this.ready = Promise.resolve();
      }
      
      import(LIB)
      .then(function ({
  			update,
  			loadPose,
  			dumpHands,
        setPose,
        getPose
      }) {
        this.handyWorkUpdate = update;
        this.dumpHands = dumpHands;
        this.loadPose = loadPose;
        this.setPose = setPose;
        this.getPose = getPose;

        loadPose('relax', POSE_FOLDER + 'relax.handpose');
        loadPose('fist', POSE_FOLDER + 'fist.handpose');
        loadPose('flat', POSE_FOLDER + 'flat.handpose');
        loadPose('point', POSE_FOLDER + 'point.handpose');
        loadPose('horns', POSE_FOLDER + 'horns.handpose');
        loadPose('shaka', POSE_FOLDER + 'shaka.handpose');
        loadPose('vulcan', POSE_FOLDER + 'vulcan.handpose');
      }.bind(this));
      
      for (const handedness of handednesses) {
        const els = Array.from(this.el.querySelectorAll(`[data-${handedness}]`));
        for (const el of els) {
          el.object3D.visible = false;
        }
      }

      sceneEl.addEventListener("enter-vr", () => {
        for (const name of ["select", "selectstart", "selectend", "squeeze", "squeezeend", "squeezestart"])
          sceneEl.xrSession.addEventListener(name, this.eventFactory(name, this));
      });

      this.elArrays = { left: [], right: [], none: [] };
      this.elMaps = { left: new Map(), right: new Map(), none: new Map() };
      const observer = new MutationObserver((function observeFunction() {
        for (const handedness of handednesses) {
          self.elArrays[handedness].splice(0);
          self.elMaps[handedness].clear();
        }

        const els = Array.from(self.el.querySelectorAll(`[data-left],[data-right],[data-none]`));
        for (const el of els) {
          for (const handedness of handednesses) {
            if (el.dataset[handedness] !== undefined) {
              self.elArrays[handedness].push(el);
              const poseName = el.dataset[handedness];
              const poseElArray = self.elMaps[handedness].get(poseName) || [];
              poseElArray.push(el);
              self.elMaps[handedness].set(poseName, poseElArray);
            }
          }
        }
        return observeFunction;
      }.bind(this))());
      observer.observe(this.el, { childList: true, attributes: true, subtree: true });
    },

    async gltfToJoints(src, name) {
      const el = this.el;
      await this.ready;

      const gltf = await new Promise(function (resolve, reject) {
        this.loader.load(src, resolve, undefined, reject);
      }.bind(this));

      const object = gltf.scene.children[0];
      const mesh = object.getObjectByProperty("type", "SkinnedMesh");
      
      if (this.el.components.material) {
        if (this.data.materialOverride === 'both' || this.data.materialOverride === name) {
          mesh.material = this.el.components.material.material;
        }
      }
      
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.skeleton.pose();
      
      const bones = [];
      for (const jointName of joints) {
        const bone = object.getObjectByName(jointName);
        if (bone !== undefined) {
          bone.jointName = jointName;
          bones.push(bone);
          bone.applyMatrix4(this.el.object3D.matrixWorld);
          bone.updateMatrixWorld();
        } else {
          console.warn(`Couldn't find ${jointName} in ${src} hand mesh`);
          bones.push(undefined); // add an empty slot
        }
      }
      el.setObject3D('hand-mesh-' + name, mesh);
      el.emit("model-loaded", { format: "gltf", model: mesh });
      return bones;
    },

    async update(oldData) {
      const el = this.el;
      const srcLeft = this.data.left;
      const srcRight = this.data.right;

      // Only reload models if they changed
      if (
        oldData.left !== this.data.left ||
        oldData.right !== this.data.right ||
        oldData.renderGamepad !== this.data.renderGamepad
      ) {
        this.remove();
      }
      if (oldData.left !== this.data.left || oldData.right !== this.data.right) {
        try {
          this.bonesRight = await this.gltfToJoints(srcRight, "right");
          this.bonesLeft = await this.gltfToJoints(srcLeft, "left");
        } catch (error) {
          const message = error && error.message ? error.message : "Failed to load glTF model";
          console.warn(message);
          el.emit("hand-model-error", { message });
        }
      }
    },

    eventFactory(eventName, bindTarget, event) {
      function eventHandler(e) {
        const session = this.el.sceneEl.xrSession;
        const frame = e.frame;
        const inputSource = e.inputSource;
        const referenceSpace = this.el.sceneEl.renderer.xr.getReferenceSpace();
        const pose = frame.getPose(inputSource.targetRaySpace, referenceSpace);
        const handedness = e.inputSource.handedness;
        const details = {
          inputSource,
          handedness
        };
        if (!pose) return;

        const allEls = this.elArrays[handedness];
        if (inputSource.targetRayMode === "screen") {
          const name = `screen-${
          Array.from(session.inputSources).filter(i=>i.targetRayMode === "screen").indexOf(inputSource)
        }`;
          for (const el of allEls) {
            if (el.dataset[handedness] === name) {
              el.object3D.position.copy(pose.transform.position);
              el.object3D.quaternion.copy(pose.transform.orientation);
              el.object3D.visible = (el.getDOMAttribute('visible') !== false);
              el.emit(eventName, details);
            }
          }
        } else if (inputSource.gamepad || inputSource.hand) {
          for (const el of allEls) el.emit(eventName, details);
        }
      }
      if (event) return eventHandler.call(bindTarget, event);
      return eventHandler.bind(bindTarget);
    },

    getControllerModel(index, inputSource) {
      const object = this.el.getObject3D('controller-model-' + inputSource.handedness);
      if (object) {
        return object;
      } else {
        const renderer = this.el.sceneEl.renderer;
        const group = renderer.xr.getControllerGrip(index);
        const model = this.controllerModelFactory.createControllerModel(group);

        // This tells the controllerModel that a new inputSource was just added and a model should be generated
        group.dispatchEvent({ type: 'connected', data: inputSource });
        this.el.setObject3D('controller-model-' + inputSource.handedness, model);
        return model;
      }
    },

    tick() {
      const session = this.el.sceneEl.xrSession;
      if (!session) return;
      const renderer = this.el.sceneEl.renderer;
      const referenceSpace = renderer.xr.getReferenceSpace();
      const toUpdate = [];
      const frame = this.el.sceneEl.frame;

      for (const el of this.el.children){
        el.object3D.visible = false;
      }

      let i=0;
      let transientSourceIndex = 0;
      inputSourceLoop:
      for (const inputSource of session.inputSources) {
        const inputSourceIndex = i++;
        const magnetEl = this.el.querySelector(`[data-magnet][data-${inputSource.handedness}]`);
        let magnetTarget = null;
        let fadeT = 1;
        let bones = [];
        const toMagnet = [];
        let controllerModel;
        let handMesh;
        
        const allEls = this.elArrays[inputSource.handedness];
        const elMap = this.elMaps[inputSource.handedness];

        handMesh = this.el.getObject3D("hand-mesh-" + inputSource.handedness);
        if (inputSource.hand) {
          toUpdate.push(inputSource);
          const controllerModel = this.el.getObject3D('controller-model-' + inputSource.handedness);
          if (controllerModel) controllerModel.visible = false;
    
          bones =
            (inputSource.handedness === "right" && this.bonesRight) ||
            (inputSource.handedness === "left" && this.bonesLeft);
          if (!bones.length) continue;
          for (const bone of bones) {
            const joint = inputSource.hand.get(bone.jointName);
            toMagnet.push(bone);
            if (joint) {

              // Keep hand elements visible even when tracking is lost
              if (handMesh.visible) {
                if (elMap.has(bone.jointName)) {
                  for (const el of elMap.get(bone.jointName)) {
                    el.object3D.visible = (el.getDOMAttribute('visible') !== false);
                  }
                }
              }

              const pose = frame.getJointPose(joint, referenceSpace);
              if (pose) {
                handMesh.visible = true;
                if (elMap.has(bone.jointName)) {
                  for (const el of elMap.get(bone.jointName)) {
                    el.object3D.position.copy(pose.transform.position);
                    el.object3D.quaternion.copy(pose.transform.orientation);
                    if (el.dataset.noMagnet === undefined) toMagnet.push(el.object3D);
                  }
                }
                
                bone.position.copy(pose.transform.position);
                bone.quaternion.copy(pose.transform.orientation);
              } else {
                // Failed to get hand pose so continue looping over other inputSource
                continue inputSourceLoop;
              }
            }
          }
        } else if (handMesh)  {
          handMesh.visible = false;
        }

        if (inputSource.targetRayMode === "screen") {
          const name = `screen-${transientSourceIndex++}`;
          if (elMap.has(name)) {
            const pose = frame.getPose(inputSource.targetRaySpace, referenceSpace);
            if (!pose) continue inputSourceLoop;
            for (const el of elMap.get(name)) {
              el.object3D.position.copy(pose.transform.position);
              el.object3D.quaternion.copy(pose.transform.orientation);
              el.object3D.visible = (el.getDOMAttribute('visible') !== false);
            }
          }

          // Don't do the magnet behaviour and don't render any gamepads
          continue inputSourceLoop;
        }

        // handle any tracked elements attached to the ray space of the input source this works for any types
        for (const [name, inputSourcePose] of [['ray', inputSource.targetRaySpace],['grip', inputSource.gripSpace]]) {
          if (elMap.has(name) && inputSourcePose) {
            const pose = frame.getPose(inputSourcePose, referenceSpace);
            if (pose) {
              for (const el of elMap.get(name)) {
                el.object3D.position.copy(pose.transform.position);
                el.object3D.quaternion.copy(pose.transform.orientation);
                el.object3D.visible = (el.getDOMAttribute('visible') !== false);
                if (el.dataset.noMagnet === undefined) toMagnet.push(el.object3D);
              }
            }
          }
        }

        // If we should draw gamepads then do, but don't draw gamepad and hand if btoh present
        if (
          (this.data.renderGamepad === "any" || this.data.renderGamepad === inputSource.handedness) &&
          inputSource.gamepad && !inputSource.hand
        ) {
          controllerModel = this.getControllerModel(inputSourceIndex, inputSource);
          controllerModel.visible = true;

          if (inputSource.gripSpace) {
            const pose = frame.getPose(inputSource.gripSpace, referenceSpace);
            if (pose) {
              controllerModel.position.copy(pose.transform.position);
              controllerModel.quaternion.copy(pose.transform.orientation);
              toMagnet.push(controllerModel);
            }
          }

          // if it has a gamepad fire events for gamepad changes
          const old = prevGamePads.get(inputSource);
          const data = {
            buttons: inputSource.gamepad.buttons.map(b => b.value),
            axes: inputSource.gamepad.axes.slice(0)
          };
          if (old) {
            const eventDetails = {handedness: inputSource.handedness, inputSource, data};
            data.buttons.forEach((value,i)=>{
              if (value !== old.buttons[i]) {
                let name = controllerModel.gamepadMappings?.buttons[i] || `button${i}`;
                if (value === 1) {
                  this.emitGamepad(allEls, `${name}down`, Object.assign({value}, eventDetails));
                } else {
                  this.emitGamepad(allEls, `${name}up`, Object.assign({value}, eventDetails));
                }
              }
            });
            const axesMapping = controllerModel.gamepadMappings?.axes;
            if (axesMapping && axesMapping.length) {
              // There are some named axis so try to combine them together
              changedAxes.clear();
              const details =  {};
              axesMapping.forEach(({name}, i)=>{
                if (name) {
                  const value = data.axes[i];
                  if (value !== old.axes[i]) {
                    changedAxes.add(name);
                  }
                }
              });
              if (changedAxes.size) {
                axesMapping.forEach(({name, type}, i)=>{
                  if (name && changedAxes.has(name)) {
                    const value = data.axes[i];
                    details[name] =  details[name] || {};
                    details[name][type.slice(0,1)] = value;
                  }
                });
                for (const [name, detail] of Object.entries(details)) {
                  this.emitGamepad(allEls, `${name}moved`, Object.assign(detail, eventDetails));
                }
              }
            } else {
              data.axes.forEach((value,i)=>{
                let name = controllerModel.gamepadMappings?.axes[i] || `axes${i}`;
                if (value !== old.axes[i]) {
                  this.emitGamepad(allEls, `${name}moved`, Object.assign({value}, eventDetails));
                }
              });
            }
          }
          prevGamePads.set(inputSource, data);
        }
        
        if (magnetEl) {
          magnetEl.object3D.updateWorldMatrix(true, false);
          const magnetTargets = document.querySelectorAll(magnetEl.dataset.magnet);
          magnetEl.object3D.getWorldPosition(tempVector3_A);
          for (const el of magnetTargets) {
            const [magnetRange,fadeEnd] = (el.dataset.magnetRange || "0.2,0.1").split(',').map(n => Number(n));
            const d =  el.object3D.getWorldPosition(tempVector3_B).sub(tempVector3_A).length();
            if (d < magnetRange) {
              magnetTarget = el;
              fadeT = invlerp(magnetRange,fadeEnd===undefined?magnetRange:fadeEnd,d);
              break;
            }
          }

          if (fadeT > 0.5 && magnetTarget && magnetTarget.id) {
            magnetEl.dataset.magnetTarget = magnetTarget.id;
          } else {
            delete magnetEl.dataset.magnetTarget;
          }
        }
        
        if (magnetTarget) {

          this.el.object3D.worldToLocal(magnetTarget.object3D.getWorldPosition(tempVector3_A));
          tempVector3_B.copy(magnetEl.object3D.position);
          tempVector3_A.lerp(tempVector3_B, 1-fadeT).sub(tempVector3_B);
          
          this.el.object3D.getWorldQuaternion(tempQuaternion_C).invert();
          magnetTarget.object3D.getWorldQuaternion(tempQuaternion_A);
          tempQuaternion_A.premultiply(tempQuaternion_C);
          tempQuaternion_B.copy(magnetEl.object3D.quaternion);
          tempQuaternion_A.slerp(tempQuaternion_B, 1-fadeT).multiply(tempQuaternion_B.invert());
          
          // Move elements to match the bones but skil elements which are marked data-no-magnet
          for (const object3D of toMagnet) {
            object3D.position.sub(tempVector3_B);
            object3D.position.applyQuaternion(tempQuaternion_A);
            object3D.position.add(tempVector3_B);
            object3D.applyQuaternion(tempQuaternion_A);
            object3D.position.add(tempVector3_A);
          }
        }
        for (const bone of bones) {
          bone.applyMatrix4(this.el.object3D.matrixWorld);
          bone.updateMatrixWorld();
        }
      }

      // perform hand pose detection
      if (toUpdate.length && this.handyWorkUpdate) {
        this.handyWorkUpdate(
          toUpdate,
          referenceSpace,
          frame,
          this.handyWorkCallback
        );
      }
    },
    handyWorkCallback: function ({
  		distances, handedness
  	}) {
  		this.emitHandpose(distances[0][0], handedness, {
        pose: distances[0][0],
        poses: distances,
        handedness
      });
  	},
    emitGamepad (els, name, details) {
      details.event = name;
      for (const el of els) {
        el.emit(name, details, false);
        el.emit('gamepad', details, false);
      }
    },
    emitHandpose(name, handedness, details) {
      if (name === this[handedness + '_currentPose']) return;
      const els = Array.from(this.el.querySelectorAll(`[data-${handedness}]`));
      
      clearTimeout(this[handedness + '_vshortTimeout']);
      clearTimeout(this[handedness + '_shortTimeout']);
      clearTimeout(this[handedness + '_longTimeout']);
      
      this[handedness + '_currentPose'] = name;

      this[handedness + '_vshortTimeout'] = setTimeout(() => {
        for (const el of els) {
          el.emit('pose_' + name, details, false);
          el.emit('pose', details, false);
        }
      }, this.data.fuseVShort);
      
      this[handedness + '_shortTimeout'] = setTimeout(() => {
        for (const el of els) el.emit('pose_' + name + '_fuseShort', details, false);
      }, this.data.fuseShort);
      
      this[handedness + '_longTimeout'] = setTimeout(() => { 
        for (const el of els) el.emit('pose_' + name + '_fuseLong', details, false);
      }, this.data.fuseLong);
    },
    remove() {
      if (this.bonesLeft) {
        this.bonesLeft = null;
        this.el.removeObject3D("hand-mesh-left");
      }
      if (this.bonesRight) {
        this.bonesRight = null;
        this.el.removeObject3D("hand-mesh-right");
      }
      if (this.el.getObject3D('controller-model-left')) this.el.removeObject3D('controller-model-left');
      if (this.el.getObject3D('controller-model-right')) this.el.removeObject3D('controller-model-right');
      if (this.el.getObject3D('controller-model-none')) this.el.removeObject3D('controller-model-none');
    },
  });

})();
//# sourceMappingURL=handy-controls.js.map
