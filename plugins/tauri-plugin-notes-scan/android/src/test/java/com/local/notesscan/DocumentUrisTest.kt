package com.local.notesscan

import org.junit.Assert.*
import org.junit.Test

class DocumentUrisTest {
    private val app = "com.local.notesclone"
    private val declared = listOf("legacy.custom.provider;another.own.provider")
    @Test fun ownFileProviderAndPackagePrefixesAreProtected() {
        for (authority in listOf(app, "$app.fileprovider", "$app.custom", "COM.LOCAL.NOTESCLONE.FILEPROVIDER", "0@$app.fileprovider", "10@COM.LOCAL.NOTESCLONE.FILEPROVIDER"))
            assertTrue(authority,DocumentUris.isManagedAuthority(authority,app,declared))
    }
    @Test fun declaredAliasesAreProtectedEvenOutsidePackageNamespace() {
        for (authority in listOf("legacy.custom.provider", "another.own.provider", "0@LEGACY.CUSTOM.PROVIDER"))
            assertTrue(DocumentUris.isManagedAuthority(authority,app,declared))
    }
    @Test fun externalDocumentProvidersRemainAvailable() {
        for (authority in listOf("com.android.externalstorage.documents", "com.android.providers.downloads.documents", "10@com.android.externalstorage.documents", "com.local.notesclone2.fileprovider"))
            assertFalse(DocumentUris.isManagedAuthority(authority,app,declared))
    }
    @Test fun ambiguousAuthorityDoesNotPassValidation() {
        for (authority in listOf("", "@com.local.notesclone.fileprovider", "user@com.local.notesclone.fileprovider", "0@1@com.local.notesclone.fileprovider", "com.local.notesclone.fileprovider/other", "com.local.notesclone.fileprovider%2f", "com.local.notesclone.fileprovider ")) {
            try { DocumentUris.isManagedAuthority(authority,app,declared); fail("invalid authority accepted: $authority") }
            catch (_: IllegalArgumentException) { }
        }
    }
}
