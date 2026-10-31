package com.goodfriends

import android.os.Build
import android.view.autofill.AutofillManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AutofillModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName() = NAME

  // Valide la saisie en cours : Google Autofill propose alors d'enregistrer l'identifiant et le mot de passe.
  @ReactMethod
  fun commit() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val activity = reactApplicationContext.currentActivity ?: return
    activity.runOnUiThread {
      activity.getSystemService(AutofillManager::class.java)?.commit()
    }
  }

  companion object {
    const val NAME = "GoodfriendsAutofill"
  }
}
