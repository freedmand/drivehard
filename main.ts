const CAMERA_SIZE: [number, number] = [640, 480];
const TARGET_FPS = 60;

const NOSE_KEYPOINT = 0;
const LEFT_EAR_KEYPOINT = 3;
const RIGHT_EAR_KEYPOINT = 4;
const LEFT_SHOULDER_KEYPOINT = 5;
const RIGHT_SHOULDER_KEYPOINT = 6;

const POSE_CONFIDENCE_THRESHOLD = 0.3;

const POSE_LERP_FACTOR = 0.1;

const MOVE_THRESHOLD = 0.1;

const Y_MIN = 0.6;
const Y_MAX = 1.4;

class App {
  cameraLoaded = false;
  public poseDetector: poseDetection.PoseDetector | null = null;
  public xInput = 0.5;
  public yInput = 0.5;
  public width = window.innerWidth;
  public height = window.innerHeight;
  public ctx: CanvasRenderingContext2D;

  constructor(
    readonly videoElem: HTMLVideoElement,
    readonly canvasElem: HTMLCanvasElement
  ) {
    this.ctx = canvasElem.getContext("2d")!;
    this.updateCanvas();
    window.addEventListener("resize", this.updateCanvas.bind(this));
  }

  updateCanvas() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.canvasElem.width = width;
    this.canvasElem.height = height;
    this.width = width;
    this.height = height;
  }

  async run() {
    if (!this.poseDetector) {
      await this.setupPoseDetector();
    }

    if (!this.cameraLoaded) {
      await this.setupCamera({
        targetFPS: TARGET_FPS,
        size: CAMERA_SIZE,
      });
    }

    await this.runPrediction();

    requestAnimationFrame(this.run.bind(this));
  }

  async runPrediction() {
    if (!this.poseDetector) {
      throw new Error("Pose detector not initialized");
    }
    if (!this.cameraLoaded) {
      throw new Error("Camera not loaded");
    }

    const poses = await this.poseDetector.estimatePoses(this.videoElem, {
      maxPoses: 1,
    });
    if (poses.length === 1) {
      const pose = poses[0];
      const nose = pose.keypoints[NOSE_KEYPOINT];
      const leftShoulder = pose.keypoints[LEFT_SHOULDER_KEYPOINT];
      const rightShoulder = pose.keypoints[RIGHT_SHOULDER_KEYPOINT];

      // X input
      if (
        nose.score! >= POSE_CONFIDENCE_THRESHOLD &&
        leftShoulder.score! >= POSE_CONFIDENCE_THRESHOLD &&
        rightShoulder.score! >= POSE_CONFIDENCE_THRESHOLD
      ) {
        this.pushXInput(
          (nose.x - leftShoulder.x) / (rightShoulder.x - leftShoulder.x)
        );
      } else {
        this.pushXInput(0.5);
      }

      // Y input
      const leftEar = pose.keypoints[LEFT_EAR_KEYPOINT];
      const rightEar = pose.keypoints[RIGHT_EAR_KEYPOINT];
      if (
        leftShoulder.score! >= POSE_CONFIDENCE_THRESHOLD &&
        rightShoulder.score! >= POSE_CONFIDENCE_THRESHOLD &&
        leftEar.score! >= POSE_CONFIDENCE_THRESHOLD &&
        rightEar.score! >= POSE_CONFIDENCE_THRESHOLD &&
        nose.score! >= POSE_CONFIDENCE_THRESHOLD
      ) {
        const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
        const earY = (leftEar.y + rightEar.y) / 2;
        const y = (nose.y - shoulderY) / (earY - shoulderY);
        const yScaled = (y - Y_MIN) / (Y_MAX - Y_MIN);
        this.pushYInput(Math.max(0, Math.min(1, yScaled)));
      } else {
      }
    } else {
      // Slowly reset back to normal if pose doesn't go through
      this.pushXInput(0.5);
      this.pushYInput(0.5);
    }

    this.draw();
  }

  pushXInput(xInput: number) {
    this.xInput = this.xInput + (xInput - this.xInput) * POSE_LERP_FACTOR;
  }

  pushYInput(yInput: number) {
    this.yInput = this.yInput + (yInput - this.yInput) * POSE_LERP_FACTOR;
  }

  draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw center line in white
    this.ctx.strokeStyle = "white";
    this.ctx.beginPath();
    this.ctx.moveTo(this.width / 2, 0);
    this.ctx.lineTo(this.width / 2, this.height);
    this.ctx.stroke();

    // Draw threshold lines in yellow
    this.ctx.strokeStyle = "yellow";
    this.ctx.beginPath();
    this.ctx.moveTo(this.width / 2 - MOVE_THRESHOLD * this.width, 0);
    this.ctx.lineTo(this.width / 2 - MOVE_THRESHOLD * this.width, this.height);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(this.width / 2 + MOVE_THRESHOLD * this.width, 0);
    this.ctx.lineTo(this.width / 2 + MOVE_THRESHOLD * this.width, this.height);
    this.ctx.stroke();

    const x = this.xInput * this.width;
    const y = (1 - this.yInput) * this.height;
    const radius = 50;

    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
    this.ctx.fillStyle =
      Math.abs(this.xInput - 0.5) >= MOVE_THRESHOLD
        ? "rgba(255, 255, 0, 0.8)"
        : "rgba(255, 255, 255, 0.5)";
    this.ctx.fill();
  }

  async setupPoseDetector() {
    this.poseDetector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        enableSmoothing: true,
      }
    );
  }

  /**
   * Initiate a Camera instance and wait for the camera stream to be ready.
   * @param cameraParam From app `STATE.camera`.
   */
  async setupCamera(cameraParam: {
    targetFPS: number;
    size: [number, number];
  }) {
    // adapted from https://github.com/tensorflow/tfjs-models/blob/master/pose-detection/demos/live_video/src/index.js
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        "Browser API navigator.mediaDevices.getUserMedia not available"
      );
    }

    const videoConfig = {
      audio: false,
      video: {
        facingMode: "user",
        // Only setting the video to a specified size for large screen, on
        // mobile devices accept the default size.
        width: cameraParam.size[0],
        height: cameraParam.size[1],
        frameRate: {
          ideal: cameraParam.targetFPS,
        },
      },
    };

    const stream = await navigator.mediaDevices.getUserMedia(videoConfig);

    this.videoElem.srcObject = stream;

    // Wait til the camera is initialized
    await new Promise((resolve) => {
      this.videoElem.onloadedmetadata = () => {
        resolve(true);
      };
    });

    this.videoElem.play();
    this.cameraLoaded = true;
  }
}

const app = new App(
  document.querySelector("#video") as HTMLVideoElement,
  document.querySelector("#canvas") as HTMLCanvasElement
);
app.run();

export {};
