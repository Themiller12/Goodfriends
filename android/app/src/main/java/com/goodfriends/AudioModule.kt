package com.goodfriends

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.IOException

/**
 * Enregistrement et lecture des messages vocaux, et lecture de fichiers locaux en base64.
 * Les enregistrements sont stockés dans le cache de l'application (AAC / MPEG-4, mono).
 */
class AudioModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  private val mainHandler = Handler(Looper.getMainLooper())

  private var recorder: MediaRecorder? = null
  private var recordingFile: File? = null
  private var recordingStartedAt = 0L

  private var player: MediaPlayer? = null
  private var playerId: String? = null
  private var playerPrepared = false
  private val progressRunnable =
      object : Runnable {
        override fun run() {
          val current = player ?: return
          val id = playerId ?: return
          if (playerPrepared && current.isPlaying) {
            emit(
                EVENT_PROGRESS,
                id,
                current.currentPosition,
                current.duration,
            )
          }
          mainHandler.postDelayed(this, PROGRESS_INTERVAL_MS)
        }
      }

  override fun getName() = NAME

  override fun invalidate() {
    super.invalidate()
    mainHandler.post {
      releasePlayer()
      discardRecording()
    }
  }

  private fun emit(event: String, id: String, positionMs: Int, durationMs: Int) {
    if (!reactApplicationContext.hasActiveReactInstance()) return
    val params =
        Arguments.createMap().apply {
          putString("id", id)
          putInt("positionMs", positionMs)
          putInt("durationMs", durationMs)
        }
    reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(event, params)
  }

  // ---------------------------------------------------------------- Enregistrement

  @ReactMethod
  fun startRecording(promise: Promise) {
    mainHandler.post {
      if (ContextCompat.checkSelfPermission(
          reactApplicationContext, Manifest.permission.RECORD_AUDIO) !=
          PackageManager.PERMISSION_GRANTED) {
        promise.reject("PERMISSION_DENIED", "Autorisation du microphone refusée")
        return@post
      }
      if (recorder != null) {
        promise.reject("ALREADY_RECORDING", "Un enregistrement est déjà en cours")
        return@post
      }
      releasePlayer()

      val file = File(reactApplicationContext.cacheDir, "voice_${System.currentTimeMillis()}.m4a")
      @Suppress("DEPRECATION")
      val newRecorder =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(reactApplicationContext)
          } else {
            MediaRecorder()
          }
      try {
        newRecorder.apply {
          setAudioSource(MediaRecorder.AudioSource.MIC)
          setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
          setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
          setAudioChannels(1)
          setAudioSamplingRate(44100)
          setAudioEncodingBitRate(64000)
          setMaxDuration(MAX_RECORDING_MS)
          setOutputFile(file.absolutePath)
          setOnInfoListener { _, what, _ ->
            if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) {
              emit(EVENT_LIMIT, "", MAX_RECORDING_MS, MAX_RECORDING_MS)
            }
          }
          prepare()
          start()
        }
        recorder = newRecorder
        recordingFile = file
        recordingStartedAt = System.currentTimeMillis()
        promise.resolve(null)
      } catch (e: Exception) {
        try {
          newRecorder.release()
        } catch (_: Exception) {}
        file.delete()
        promise.reject("RECORD_START_FAILED", "Impossible de démarrer l'enregistrement", e)
      }
    }
  }

  @ReactMethod
  fun stopRecording(promise: Promise) {
    mainHandler.post {
      val current = recorder
      val file = recordingFile
      if (current == null || file == null) {
        promise.reject("NOT_RECORDING", "Aucun enregistrement en cours")
        return@post
      }
      val durationMs = (System.currentTimeMillis() - recordingStartedAt).toInt()
      recorder = null
      recordingFile = null
      try {
        current.stop()
        current.release()
        val result =
            Arguments.createMap().apply {
              putString("path", file.absolutePath)
              putInt("durationMs", minOf(durationMs, MAX_RECORDING_MS))
              putDouble("size", file.length().toDouble())
            }
        promise.resolve(result)
      } catch (e: Exception) {
        // stop() échoue si l'enregistrement est trop court
        try {
          current.release()
        } catch (_: Exception) {}
        file.delete()
        promise.reject("RECORD_STOP_FAILED", "Enregistrement trop court ou invalide", e)
      }
    }
  }

  @ReactMethod
  fun cancelRecording(promise: Promise) {
    mainHandler.post {
      discardRecording()
      promise.resolve(null)
    }
  }

  private fun discardRecording() {
    val current = recorder
    val file = recordingFile
    recorder = null
    recordingFile = null
    if (current != null) {
      try {
        current.stop()
      } catch (_: Exception) {}
      try {
        current.release()
      } catch (_: Exception) {}
    }
    file?.delete()
  }

  // ---------------------------------------------------------------- Fichiers

  /** Lit un fichier local (file:// ou content://) et le retourne en base64, taille limitée. */
  @ReactMethod
  fun readBase64(uriOrPath: String, maxBytes: Double, promise: Promise) {
    Thread {
          try {
            val uri = Uri.parse(uriOrPath)
            val stream =
                if (uri.scheme == "content") {
                  reactApplicationContext.contentResolver.openInputStream(uri)
                } else {
                  val path = if (uri.scheme == "file") uri.path else uriOrPath
                  FileInputStream(File(path ?: throw IOException("Chemin invalide")))
                } ?: throw IOException("Fichier illisible")
            val limit = maxBytes.toLong()
            val buffer = ByteArray(16 * 1024)
            val out = ByteArrayOutputStream()
            stream.use { input ->
              while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                out.write(buffer, 0, read)
                if (out.size() > limit) {
                  promise.reject("FILE_TOO_LARGE", "Fichier trop volumineux")
                  return@Thread
                }
              }
            }
            promise.resolve(Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP))
          } catch (e: Exception) {
            promise.reject("READ_FAILED", "Lecture du fichier impossible", e)
          }
        }
        .start()
  }

  /** Supprime un fichier du cache de l'application (jamais en dehors). */
  @ReactMethod
  fun deleteFile(path: String, promise: Promise) {
    try {
      val file = File(path).canonicalFile
      val cache = reactApplicationContext.cacheDir.canonicalFile
      if (file.path.startsWith(cache.path + File.separator)) {
        file.delete()
      }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.resolve(null)
    }
  }

  // ---------------------------------------------------------------- Lecture

  @ReactMethod
  fun play(id: String, url: String, promise: Promise) {
    mainHandler.post {
      if (recorder != null) {
        promise.reject("RECORDING", "Enregistrement en cours")
        return@post
      }
      releasePlayer()
      val next = MediaPlayer()
      try {
        next.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build())
        next.setDataSource(url)
        next.setOnPreparedListener {
          playerPrepared = true
          it.start()
          mainHandler.removeCallbacks(progressRunnable)
          mainHandler.post(progressRunnable)
          promise.resolve(it.duration)
        }
        next.setOnCompletionListener {
          val finishedId = playerId
          val duration = it.duration
          releasePlayer()
          if (finishedId != null) emit(EVENT_END, finishedId, duration, duration)
        }
        next.setOnErrorListener { _, _, _ ->
          val failedId = playerId
          val wasPrepared = playerPrepared
          releasePlayer()
          if (!wasPrepared) {
            promise.reject("PLAY_FAILED", "Lecture impossible")
          } else if (failedId != null) {
            emit(EVENT_ERROR, failedId, 0, 0)
          }
          true
        }
        player = next
        playerId = id
        playerPrepared = false
        next.prepareAsync()
      } catch (e: Exception) {
        try {
          next.release()
        } catch (_: Exception) {}
        player = null
        playerId = null
        promise.reject("PLAY_FAILED", "Lecture impossible", e)
      }
    }
  }

  @ReactMethod
  fun pause() {
    mainHandler.post {
      val current = player ?: return@post
      if (playerPrepared && current.isPlaying) current.pause()
    }
  }

  @ReactMethod
  fun resume() {
    mainHandler.post {
      val current = player ?: return@post
      if (playerPrepared && !current.isPlaying) {
        current.start()
        mainHandler.removeCallbacks(progressRunnable)
        mainHandler.post(progressRunnable)
      }
    }
  }

  @ReactMethod
  fun stop() {
    mainHandler.post { releasePlayer() }
  }

  private fun releasePlayer() {
    mainHandler.removeCallbacks(progressRunnable)
    val current = player
    player = null
    playerId = null
    playerPrepared = false
    if (current != null) {
      try {
        current.setOnPreparedListener(null)
        current.setOnCompletionListener(null)
        current.setOnErrorListener(null)
        current.release()
      } catch (_: Exception) {}
    }
  }

  companion object {
    const val NAME = "GoodfriendsAudio"
    const val EVENT_PROGRESS = "GoodfriendsAudioProgress"
    const val EVENT_END = "GoodfriendsAudioEnd"
    const val EVENT_ERROR = "GoodfriendsAudioError"
    const val EVENT_LIMIT = "GoodfriendsAudioLimit"
    private const val MAX_RECORDING_MS = 300000
    private const val PROGRESS_INTERVAL_MS = 150L
  }
}
