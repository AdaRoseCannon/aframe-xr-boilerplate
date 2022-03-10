// WIP This is going to be a componet to allow the quick saving of new hand poses
const handyWorkModule = import('https://cdn.jsdelivr.net/npm/handy-work/build/handy-work.min.js');
async function recordPose(frames=180, inputSources, referenceSpace) {
  const {generatePose} = await handyWorkModule;
  const tempHands = {};
	for (const source of inputSources) {
		if (!source.hand) continue;
		tempHands[source.handedness] = source.hand;
	}
	if (tempHands.left && tempHands.right) {
		const size = tempHands.left.size;
    const frameSize = (
			1 +         // store size
			size * 16 + // left hand
			size * 16 + // right hand
			size +      // weighting for individual joints left hand
			size        // weighting for individual joints right hand
		);
    
    return function * () {

      // This gets filled by the gerneatePose function
      const outData = new Float32Array(frameSize * frames);
      for (let i=0;i<frames;i++) {
        const frame = yield;
        const float32Array = new Float32Array(outData, frameSize, frameSize*i);
        generatePose(inputSources, referenceSpace, frame, float32Array);
      }
      return outData;
    }
  }
}