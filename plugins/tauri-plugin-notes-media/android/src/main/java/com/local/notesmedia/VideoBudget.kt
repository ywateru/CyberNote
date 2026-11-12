package com.local.notesmedia

/** Pure policy shared by actual decoding and JVM boundary checks. */
internal object VideoBudget {
    fun scaled(api:Int,width:Int,height:Int,budget:Long):Boolean {
        require(width>0 && height>0 && budget in 1..24_000_000)
        val pixels=width.toLong()*height
        require(pixels<=budget)
        if(api>=27)return true
        require(api==26 && pixels<=1_000_000)
        return false
    }
}
