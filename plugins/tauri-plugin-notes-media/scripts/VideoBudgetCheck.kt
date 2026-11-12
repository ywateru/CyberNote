package com.local.notesmedia
fun main(){
 check(VideoBudget.scaled(27,3840,2160,24_000_000))
 check(!VideoBudget.scaled(26,1280,720,24_000_000))
 for(args in listOf(intArrayOf(26,1920,1080),intArrayOf(26,50000,50000),intArrayOf(27,8000,8000),intArrayOf(27,0,720),intArrayOf(25,640,480))) {
  check(runCatching{VideoBudget.scaled(args[0],args[1],args[2],24_000_000)}.isFailure)
 }
 println("7 video API/source-pixel boundary checks passed")
}
