package com.local.notesclone

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowCompat
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.view.inputmethod.InputMethodManager

/** Paints only the system-bar strips behind the edge-to-edge WebView. */
private class EdgeSurfaceDrawable : Drawable() {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  var topColor: Int = Color.TRANSPARENT
  var bottomColor: Int = Color.TRANSPARENT
  var topInset: Int = 0
  var bottomInset: Int = 0

  override fun draw(canvas: Canvas) {
    val area = bounds
    if (topInset > 0) {
      paint.color = topColor
      canvas.drawRect(area.left.toFloat(), area.top.toFloat(), area.right.toFloat(), (area.top + topInset).toFloat(), paint)
    }
    if (bottomInset > 0) {
      paint.color = bottomColor
      canvas.drawRect(area.left.toFloat(), (area.bottom - bottomInset).toFloat(), area.right.toFloat(), area.bottom.toFloat(), paint)
    }
  }

  override fun setAlpha(alpha: Int) {
    paint.alpha = alpha
    invalidateSelf()
  }

  override fun setColorFilter(colorFilter: android.graphics.ColorFilter?) {
    paint.colorFilter = colorFilter
    invalidateSelf()
  }

  @Deprecated("Deprecated in Java")
  override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}

class MainActivity : TauriActivity() {
  private var keyboardView: WebView? = null
  private var keyboardRequest: Runnable? = null
  private var keyboardGeneration = 0L
  private val edgeToEdge = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
  private val edgeSurface = EdgeSurfaceDrawable()
  private var systemBarTop = Color.TRANSPARENT
  private var systemBarBottom = Color.TRANSPARENT
  private var darkStatusIcons = false
  private var darkNavigationIcons = false

  private fun cancelKeyboardShow(webView: WebView) {
    keyboardGeneration++
    keyboardRequest?.let { webView.removeCallbacks(it) }
    keyboardRequest = null
  }

  override fun onPause() {
    keyboardView?.let { cancelKeyboardShow(it) }
    super.onPause()
  }

  override fun onResume() {
    super.onResume()
    applySystemBarAppearance()
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
    webView.addJavascriptInterface(object {
      @JavascriptInterface fun apply(
        topColor: String,
        bottomColor: String,
        darkStatusIcons: Boolean,
        darkNavigationIcons: Boolean,
      ) = runOnUiThread {
        val top = try { Color.parseColor(topColor) } catch (_: IllegalArgumentException) { return@runOnUiThread }
        val bottom = try { Color.parseColor(bottomColor) } catch (_: IllegalArgumentException) { return@runOnUiThread }
        systemBarTop = top
        systemBarBottom = bottom
        this@MainActivity.darkStatusIcons = darkStatusIcons
        this@MainActivity.darkNavigationIcons = darkNavigationIcons
        applySystemBarAppearance()
      }
    }, "NotesSystemBars")
  }

  private fun applySystemBarAppearance() {
    edgeSurface.topColor = systemBarTop
    edgeSurface.bottomColor = systemBarBottom
    edgeSurface.invalidateSelf()
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = darkStatusIcons
      isAppearanceLightNavigationBars = darkNavigationIcons
    }
    // Android 8-9 edge-to-edge light bars are backed by a system scrim that
    // overrides the surface behind them. Use opaque platform bar colors on
    // those releases; Android 10+ can keep true edge-to-edge and paint the
    // strips from the decor background.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      val top = systemBarTop
      val bottom = systemBarBottom
      window.decorView.post {
        window.statusBarColor = top
        window.navigationBarColor = bottom
        window.navigationBarDividerColor = bottom
      }
    } else {
      window.isStatusBarContrastEnforced = false
      window.isNavigationBarContrastEnforced = false
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    if (edgeToEdge) enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    val fallback = ContextCompat.getColor(this, R.color.system_bar_fallback)
    systemBarTop = fallback
    systemBarBottom = fallback
    darkStatusIcons = Color.luminance(fallback) >= 0.5f
    darkNavigationIcons = darkStatusIcons
    if (edgeToEdge) window.decorView.background = edgeSurface
    applySystemBarAppearance()
    // Own the visible WebView bounds here. Older WebViews can leave innerHeight
    // unchanged under edge-to-edge/adjustResize while the IME covers controls.
    // Padding the native container makes its actual layout resize; do not also
    // subtract the keyboard height in JavaScript or pass the same inset onward.
    if (edgeToEdge) {
      val content = findViewById<android.view.View>(android.R.id.content)
      ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
        val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
        val bottom = maxOf(bars.bottom, insets.getInsets(WindowInsetsCompat.Type.ime()).bottom)
        edgeSurface.topInset = bars.top
        edgeSurface.bottomInset = bars.bottom
        edgeSurface.invalidateSelf()
        view.setPadding(bars.left, bars.top, bars.right, bottom)
        insets.inset(bars.left, bars.top, bars.right, bottom)
      }
      ViewCompat.requestApplyInsets(content)
    }
  }
}
