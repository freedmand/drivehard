// Adapted from https://github.com/tensorflow/tfjs-models/tree/master/pose-detection/src/movenet

declare module poseDetection {
  export enum SupportedModels {
    MoveNet = "MoveNet",
    BlazePose = "BlazePose",
    PoseNet = "PoseNet",
  }

  export const movenet: {
    modelType: {
      SINGLEPOSE_LIGHTNING: string;
      SINGLEPOSE_THUNDER: string;
      MULTIPOSE_LIGHTNING: string;
    };
  };

  /**
   * A keypoint that contains coordinate information.
   */
  export interface Keypoint {
    x: number;
    y: number;
    z?: number;
    score?: number; // The probability of a keypoint's visibility.
    name?: string;
  }

  export interface BoundingBox {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
    width: number;
    height: number;
  }

  export interface Mask {
    toCanvasImageSource(): Promise<CanvasImageSource> /* RGBA image of same size as input, where
                            mask semantics are green and blue are always set to
                            0. Different red values denote different body
                            parts(see maskValueToBodyPart explanation below).
                            Different alpha values denote the probability of
                            pixel being a foreground pixel (0 being lowest
                            probability and 255 being highest).*/;

    toImageData(): Promise<ImageData> /* 1 dimensional array of size image width * height *
                    4, where each pixel is represented by RGBA in that order.
                    For each pixel, the semantics are green and blue are always
                    set to 0, and different red values denote different body
                    parts (see maskValueToBodyPart explanation below). Different
                    alpha values denote the probability of the pixel being a
                    foreground pixel (0 being lowest probability and 255 being
                    highest). */;

    getUnderlyingType():
      | "canvasimagesource"
      | "imagedata"
      | "tensor" /* determines which type the mask currently stores in its
                   implementation so that conversion can be avoided */;
  }

  export interface Segmentation {
    maskValueToLabel: (
      maskValue: number
    ) => string /* Maps a foreground pixel’s red value to the segmented part name
                 of that pixel. Should throw error for unsupported input
                 values.*/;
    mask: Mask;
  }

  export interface Pose {
    keypoints: Keypoint[];
    score?: number; // The probability of an actual pose.
    keypoints3D?: Keypoint[]; // Keypoints in meters in a 1m * 1m * 1m space.
    box?: BoundingBox; // A bounding box around the detected person.
    segmentation?: Segmentation; // Segmentation mask of the detected person.
    id?: number; // The unique identifier for this (tracked) pose.
  }

  /**
   * Common config for the `estimatePoses` method.
   *
   * `maxPoses`: Optional. Max number poses to detect. Default to 1, which means
   * single pose detection. Single pose detection runs more efficiently, while
   * multi-pose (maxPoses > 1) detection is usually much slower. Multi-pose
   * detection should only be used when needed.
   *
   * `flipHorizontal`: Optional. Default to false. In some cases, the image is
   * mirrored, e.g. video stream from camera, flipHorizontal will flip the
   * keypoints horizontally.
   */
  export interface EstimationConfig {
    maxPoses?: number;
    flipHorizontal?: boolean;
  }

  /**
   * Common config to create the pose detector.
   */
  export interface ModelConfig {}

  /**
   * All supported tracker types.
   */
  export enum TrackerType {
    Keypoint = "keypoint",
    BoundingBox = "boundingBox",
  }

  // A tracker that links detections (i.e. poses) and tracks based on keypoint
  // similarity.
  export interface KeypointTrackerConfig {
    keypointConfidenceThreshold: number; // The minimum keypoint confidence
    // threshold. A keypoint is only
    // compared in the OKS calculation if
    // both the new detected keypoint and
    // the corresponding track keypoint have
    // confidences above this threshold.

    keypointFalloff: number[]; // Per-keypoint falloff in OKS calculation.
    minNumberOfKeypoints: number; // The minimum number of keypoints that are
    // necessary for computing OKS. If the number
    // of confident keypoints (between a pose and
    // track) are under this value, an OKS of 0.0
    // will be given.
  }

  // A tracker that links detections (i.e. poses) and tracks based on bounding
  // box similarity.
  export interface BoundingBoxTrackerConfig {}

  export interface TrackerConfig {
    maxTracks: number; // The maximum number of tracks that an internal tracker
    // will maintain. Note that this number should be set
    // larger than EstimationConfig.maxPoses. How to set this
    // number requires experimentation with a given detector,
    // but a good starting place is about 3 * maxPoses.
    maxAge: number; // The maximum duration of time (in milliseconds) that a
    // track can exist without being linked with a new detection
    // before it is removed. Set this value large if you would
    // like to recover people that are not detected for long
    // stretches of time (at the cost of potential false
    // re-identifications).
    minSimilarity: number; // New poses will only be linked with tracks if the
    // similarity score exceeds this threshold.
    keypointTrackerParams?: KeypointTrackerConfig; // Keypoint tracker params.
    boundingBoxTrackerParams?: BoundingBoxTrackerConfig; // Box tracker params.
  }

  /**
   * MoveNet model loading config.
   *
   * `enableSmoothing`: Optional. A boolean indicating whether to use temporal
   * filter to smooth the predicted keypoints. Defaults to True. To use smoothing
   * with multi-pose detection, tracking needs to be enabled. The temporal filter
   * relies on the currentTime field of the HTMLVideoElement. You can override
   * this timestamp by passing in your own timestamp (in milliseconds) as the
   * third parameter in `estimatePoses`. This is useful when the input is a
   * tensor, which doesn't have the currentTime field. Or in testing, to simulate
   * different FPS.
   *
   * `modelType`: Optional. The type of MoveNet model to load, SinglePose
   * Lighting, SinglePose Thunder or MultiPose Lightning. Defaults to SinglePose
   * Lightning. SinglePose Lightning is a lower capacity model that can
   * run >50FPS on most modern laptops while achieving good performance.
   * SinglePose Thunder is a higher capacity model that performs better prediction
   * quality while still achieving real-time (>30FPS) speed. MultiPose Lightning
   * enables detection of up to 6 poses with similar accuracy as SinglePose
   * Lightning.
   *
   * `modelUrl`: Optional. An optional string that specifies custom url of the
   * model. This is useful for area/countries that don't have access to the model
   * hosted on TF Hub. If not provided, it will load the model specified by
   * `modelType` from tf.hub.
   *
   * `minPoseScore`: Optional. The minimum confidence score a pose needs to have
   * to be considered a valid pose detection.
   *
   * `multiPoseMaxDimension`: Optional. The target maximum dimension to use as the
   * input to the multi-pose model. Must be a multiple of 32 and defaults to 256.
   * The recommended range is [128, 512]. A higher maximum dimension results in
   * higher accuracy but slower speed, whereas a lower maximum dimension results
   * in lower accuracy but higher speed. The input image will be resized so that
   * its maximum dimension will be the given number, while maintaining the input
   * image aspect ratio. As an example: with 320 as the maximum dimension and a
   * 640x480 input image, the model will resize the input to 320x240. A 720x1280
   * image will be resized to 180x320.
   *
   * `enableTracking': Optional. A boolean indicating whether detected persons
   * will be tracked across frames. If true, each pose will have an ID that
   * uniquely identifies a person. Only used with multi-pose models.
   *
   * `trackerType`: Optional. A `TrackerType` indicating which type of tracker to
   * use. Defaults to bounding box tracking.
   *
   * `trackerConfig`: Optional. A `TrackerConfig` object that specifies the
   * configuration to use for the tracker. For properties that are not specified,
   * default values will be used.
   */
  export interface MoveNetModelConfig extends ModelConfig {
    enableSmoothing?: boolean;
    modelType?: string;
    modelUrl?: string;
    minPoseScore?: number;
    multiPoseMaxDimension?: number;
    enableTracking?: boolean;
    trackerType?: TrackerType;
    trackerConfig?: TrackerConfig;
  }

  export type PixelInput =
    | ImageData
    | HTMLVideoElement
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap;

  /**
   * Allowed input format for the `estimatePoses` method.
   */
  export type PoseDetectorInput = PixelInput;

  /**
   * MoveNet Specific Inference Config.
   */
  export interface MoveNetEstimationConfig extends EstimationConfig {}

  /**
   * User-facing interface for all pose detectors.
   */
  export interface PoseDetector {
    /**
     * Estimate poses for an image or video frame.
     * @param image An image or video frame.
     * @param config Optional. See `EstimationConfig` for available options.
     * @param timestamp Optional. In milliseconds. This is useful when image is
     *     a tensor, which doesn't have timestamp info. Or to override timestamp
     *     in a video.
     * @returns An array of poses, each pose contains an array of `Keypoint`s.
     */
    estimatePoses(
      image: PoseDetectorInput,
      config?: MoveNetEstimationConfig,
      timestamp?: number
    ): Promise<Pose[]>;

    /**
     * Dispose the underlying models from memory.
     */
    dispose(): void;

    /**
     * Reset global states in the model.
     */
    reset(): void;
  }

  /**
   * Loads the MoveNet model instance from a checkpoint. The model to be loaded
   * is configurable using the config dictionary `ModelConfig`. Please find more
   * details in the documentation of the `ModelConfig`.
   *
   * @param config `ModelConfig` dictionary that contains parameters for
   * the MoveNet loading process. Please find more details of each parameter
   * in the documentation of the `ModelConfig` interface.
   */
  export function load(modelConfig: MoveNetModelConfig): Promise<PoseDetector>;

  /**
   * Create a pose detector instance.
   *
   * @param model The name of the pipeline to load.
   */
  export function createDetector(
    model: SupportedModels,
    modelConfig?: MoveNetModelConfig
  ): Promise<PoseDetector>;
}
