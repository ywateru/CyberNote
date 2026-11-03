package com.local.notesclone

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.view.inputmethod.InputMethodManager

class MainActivity : TauriActivity() {
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    // App-owned assets only. Format controls can change selection without
    // focusing contenteditable; X explicitly resumes the system keyboard.
    webView.addJavascriptInterface(object {
      @JavascriptInterface fun hide() = runOnUiThread {
        (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager)
          .hideSoftInputFromWindow(webView.windowToken, 0)
      }
      @JavascriptInterface fun show() = runOnUiThread {
        webView.requestFocus()
        webView.postDelayed({
          (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager)
            .showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT)
        }, 80)
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
