package expo.modules.objectdetector

import android.graphics.BitmapFactory
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.objectdetector.ObjectDetector
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Free, offline object detection (MediaPipe Tasks, EfficientDet-Lite0, 80 everyday COCO
 * objects) on an image file. Returns boxes normalised to the image (0..1), so the app can snap
 * the pose outline onto a bench or chair that is actually in the scene.
 */
class ObjectDetectorModule : Module() {
  private var detector: ObjectDetector? = null
  private var maxResults = 0
  private var minScore = 0f

  private fun detectorFor(max: Int, score: Float): ObjectDetector {
    val existing = detector
    if (existing != null && max == maxResults && score == minScore) return existing
    existing?.close()
    val context = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "React context unavailable", null)
    val options = ObjectDetector.ObjectDetectorOptions.builder()
      .setBaseOptions(BaseOptions.builder().setModelAssetPath("efficientdet_lite0.tflite").build())
      .setRunningMode(RunningMode.IMAGE)
      .setMaxResults(max)
      .setScoreThreshold(score)
      .build()
    return ObjectDetector.createFromOptions(context, options).also {
      detector = it
      maxResults = max
      minScore = score
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ObjectDetector")

    AsyncFunction("detect") { path: String, max: Int, score: Double ->
      val bitmap = BitmapFactory.decodeFile(path.removePrefix("file://"))
        ?: throw CodedException("ERR_DECODE", "Could not read image $path", null)
      val result = detectorFor(max, score.toFloat()).detect(BitmapImageBuilder(bitmap).build())
      val w = bitmap.width.toFloat()
      val h = bitmap.height.toFloat()
      val out = result.detections().map { d ->
        val box = d.boundingBox()
        val top = d.categories().firstOrNull()
        mapOf(
          "label" to (top?.categoryName() ?: ""),
          "score" to (top?.score()?.toDouble() ?: 0.0),
          "x" to (box.left / w).toDouble(),
          "y" to (box.top / h).toDouble(),
          "w" to (box.width() / w).toDouble(),
          "h" to (box.height() / h).toDouble(),
        )
      }
      bitmap.recycle()
      out
    }

    OnDestroy {
      detector?.close()
      detector = null
    }
  }
}
