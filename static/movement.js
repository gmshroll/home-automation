/*

	var movementDetection = new MOVEMENTDETECTION({ 
		showBlend: false, 
		threshold: 1,
		frameRate: 8
	});
	
	movementDetection.on("movement", function(){
		showDisplay();
	});

*/
(function(){
	var MEDIASIZE = {
		width: 480,
		height: 360
	};

	window.MOVEMENTDETECTION = MOVEMENTDETECTION;
	function MOVEMENTDETECTION(initObj){
		var self = this;

		if (initObj.width){
			MEDIASIZE.width = initObj.width;
		}

		if (initObj.height){
			MEDIASIZE.height = initObj.height;
		}

		if (!initObj){
			initObj = {};
		}

		var blended = document.createElement("canvas");
		blended.classList.add("blendedcanvas");
		var contextBlended = blended.getContext('2d', { alpha: false });
		blended.width = MEDIASIZE.width;
		blended.height = MEDIASIZE.height;
		contextBlended.canvas.width = MEDIASIZE.width;
		contextBlended.canvas.height = MEDIASIZE.height;
		contextBlended.canvas.imageSmoothingEnabled = false;
		if (initObj.showBlend){
			document.body.appendChild(blended);
		}


		navigator.mediaDevices.getUserMedia({
			video: {
		        width: { ideal: MEDIASIZE.width },
		        height: { ideal: MEDIASIZE.height } 
		    }
		}).then(function(gumStream){
			var canvas = document.createElement("canvas");
			var ctx = canvas.getContext('2d', { alpha: false });
			canvas.width = MEDIASIZE.width;
			canvas.height = MEDIASIZE.height;
			ctx.canvas.width = MEDIASIZE.width;
			ctx.canvas.height = MEDIASIZE.height;
			ctx.canvas.imageSmoothingEnabled = false;

			var mirrorVideoElement = document.createElement("video");
			if ('srcObject' in mirrorVideoElement) {
				mirrorVideoElement.srcObject = gumStream;
			} else {
				mirrorVideoElement.src = window.URL.createObjectURL(gumStream); // for older browsers
			}
			mirrorVideoElement.muted = true;

			var playPromise = mirrorVideoElement.play();
			if (playPromise !== null){
				playPromise.catch(function() { mirrorVideoElement.setAttribute("controls", true); })
			}

			setInterval(function(){
				ctx.drawImage(mirrorVideoElement, 0,0);
				blend(ctx);
				var motion = checkMotion();
				if (motion.percentage > (initObj.threshold || 1)){
					if (onCallback["movement"] && typeof(onCallback["movement"]) === "function"){
						onCallback["movement"]();
					}
				}
			},1000/ (initObj.frameRate || 8));
		});

		var onCallback = {};
		self.on = function(action, callback){
			onCallback[action] = callback;
		}

		var lastImageData;
		function blend(contextSource) {
			var width = MEDIASIZE.width;
			var height = MEDIASIZE.height;
			// get webcam image data
			var sourceData = contextSource.getImageData(0, 0, width, height);
			// create an image if the previous image doesn’t exist
			if (!lastImageData) lastImageData = contextSource.getImageData(0, 0, width, height);
			// create a ImageData instance to receive the blended result
			var blendedData = contextSource.createImageData(width, height);
			// blend the 2 images
			differenceAccuracy(blendedData.data, sourceData.data, lastImageData.data);
			// draw the result in a canvas
			contextBlended.putImageData(blendedData, 0, 0);
			// store the current webcam image
			lastImageData = sourceData;
		}

		function differenceAccuracy(target, data1, data2) {
			if (data1.length != data2.length) return null;
			var i = 0;
			while (i < (data1.length * 0.25)) {
				var average1 = (data1[4*i] + data1[4*i+1] + data1[4*i+2]) / 3;
				var average2 = (data2[4*i] + data2[4*i+1] + data2[4*i+2]) / 3;
				var diff = threshold(fastAbs(average1 - average2));
				target[4*i] = diff;
				target[4*i+1] = diff;
				target[4*i+2] = diff;
				target[4*i+3] = 0xFF;
				++i;
			}
		}

		function fastAbs(value) {
		    //equal Math.abs
		    return (value ^ (value >> 31)) - (value >> 31);
		}

		function threshold(value) {
		    return (value > 0x15) ? 0xFF : 0;
		}

		function checkMotion(){
			var differenceImage = contextBlended.getImageData(0,0,MEDIASIZE.width, MEDIASIZE.height);
			var countPixels = 0;
			for (var i = 0; i <= (differenceImage.data.length); i+=4){
				if (differenceImage.data[i] > 0 && differenceImage.data[i+1] > 0 && differenceImage.data[i+2] > 0){
					countPixels++
				}
			}
			return {
				countPixels: countPixels,
				percentage: 100 * (countPixels / (MEDIASIZE.width * MEDIASIZE.height))
			};
		}
	}
})();