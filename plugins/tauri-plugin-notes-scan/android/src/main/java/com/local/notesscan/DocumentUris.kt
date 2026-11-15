package com.local.notesscan

import java.util.Locale

/** Input is Uri.authority (already percent-decoded), never encodedAuthority. */
internal object DocumentUris {
    fun normalizedAuthority(decodedAuthority: String): String {
        // Android ContentProvider URI authorities may have a numeric user-id
        // prefix. Compare the provider component, not that OS routing prefix.
        val split = decodedAuthority.lastIndexOf('@')
        val authority = if (split >= 0) {
            require(decodedAuthority.substring(0, split).matches(Regex("[0-9]+"))) { "无效文档提供程序" }
            decodedAuthority.substring(split + 1)
        } else decodedAuthority
        require(authority.isNotEmpty() && authority.length <= 512 && authority.all {
            it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9' || it == '.' || it == '_' || it == '-'
        }) { "无效文档提供程序" }
        return authority.lowercase(Locale.ROOT)
    }
    fun isManagedAuthority(decodedAuthority: String, packageName: String, declaredAuthorities: List<String>): Boolean {
        val authority = normalizedAuthority(decodedAuthority)
        val app = packageName.lowercase(Locale.ROOT)
        if (authority == app || authority.startsWith("$app.")) return true
        return declaredAuthorities.flatMap { it.split(';') }.filter { it.isNotEmpty() }
            .any { authority == normalizedAuthority(it) }
    }
}
