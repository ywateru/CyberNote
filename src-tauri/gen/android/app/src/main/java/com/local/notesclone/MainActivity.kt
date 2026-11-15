package com.local.notesclone

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.view.inputmethod.InputMethodManager

class MainActivity : TauriActivity() {
  private var keyboardView: WebView? = null
  private var keyboardRequest: Runnable? = null
  private var keyboardGeneration = 0L

  private fun cancelKeyboardShow(webView: WebView) {
    keyboardGeneration++
    keyboardRequest?.let { webView.removeCallbacks(it) }
    keyboardRequest = null
  }

  override fun onPause() {
    keyboardView?.let { cancelKeyboardShow(it) }
    super.onPause()
  }

  override fun onDestroy() {
    keyboardView?.let { cancelKeyboardShow(it) }
    keyboardView = null
    super.onDestroy()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    keyboardView?.let { cancelKeyboardShow(it) }
    keyboardView = webView
    // App-owned assets only. Format controls can change selection without
    // focusing contenteditable; X explicitly resumes the system keyboard.
    webView.addJavascriptInterface(object {
      @JavascriptInterface fun hide() = runOnUiThread {
        cancelKeyboardShow(webView)
        (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager)
          .hideSoftInputFromWindow(webView.windowToken, 0)
      }
      @JavascriptInterface fun show() = runOnUiThread {
        cancelKeyboardShow(webView)
        val generation = keyboardGeneration
        webView.requestFocus()
        val request = Runnable {
          if (generation == keyboardGeneration && keyboardView === webView &&
              !isFinishing && !isDestroyed && webView.isAttachedToWindow && webView.hasFocus()) {
            keyboardRequest = null
            (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager)
              .showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT)
          }
        }
        keyboardRequest = request
        webView.postDelayed(request, 80)
      }
    }, "NotesKeyboard")
  }
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Own the visible WebView bounds here. Older WebViews can leave innerHeight
    // unchanged under edge-to-edge/adjustResize while the IME covers controls.
    // Padding the native container makes its actual layout resize; do not also
    // subtract the keyboard height in JavaScript or pass the same inset onward.
    val content = findViewById<android.view.View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val bottom = maxOf(bars.bottom, insets.getInsets(WindowInsetsCompat.Type.ime()).bottom)
      view.setPadding(bars.left, bars.top, bars.right, bottom)
      insets.inset(bars.left, bars.top, bars.right, bottom)
    }
    ViewCompat.requestApplyInsets(content)
  }
}
