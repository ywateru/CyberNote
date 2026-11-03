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
    // Keep the web controls outside both system bars, including older WebViews
    // that do not expose CSS safe-area insets.
    val content = findViewById<android.view.View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      insets
    }
    ViewCompat.requestApplyInsets(content)
  }
}
