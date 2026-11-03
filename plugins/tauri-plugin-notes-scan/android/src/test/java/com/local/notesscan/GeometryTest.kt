package com.local.notesscan
import org.junit.Assert.*
import org.junit.Test
class GeometryTest {
    @Test fun rejectCrossedAndTinyQuadrilaterals() {
        assertTrue(Geometry.valid(Geometry.full()))
        assertFalse(Geometry.valid(listOf(Point(0f,0f),Point(1f,1f),Point(1f,0f),Point(0f,1f))))
        assertFalse(Geometry.valid(listOf(Point(Float.NaN,0f),Point(1f,0f),Point(1f,1f),Point(0f,1f))))
        assertFalse(Geometry.valid(listOf(Point(0f,0f),Point(.01f,0f),Point(.01f,.01f),Point(0f,.01f))))
        assertEquals(1f,Geometry.area(Geometry.full()),0.0001f)
    }
    @Test fun noPathCanBeAnIdentifier() {
        assertTrue(SessionStore.validId(SessionStore.newToken()))
        assertFalse(SessionStore.validId("../private"))
        assertFalse(SessionStore.validId("content://image"))
    }
}
