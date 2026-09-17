import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils } from 'three'
import { SEATS } from './tableMotion'

export const EYE_POSITION = [0.014, 0.88, 1.46]
export function FirstPersonCamera({ look, challenge, seats = SEATS }) {
  const { gl, camera } = useThree()
  useEffect(() => {
    if (challenge?.caller !== 0) return
    const target = seats[challenge.accused].position
    look.current.yaw = MathUtils.clamp(Math.atan2(EYE_POSITION[0] - target[0], EYE_POSITION[2] - target[2]), -1.15, 1.15)
    look.current.pitch = -0.2
    const timer = setTimeout(() => { look.current.yaw = 0; look.current.pitch = -0.25 }, 1600)
    return () => clearTimeout(timer)
  }, [challenge, look, seats])
  useEffect(() => {
    const canvas = gl.domElement
    canvas.tabIndex = 0
    let pointer = null
    const down = event => {
      if (event.button !== 0) return
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
      canvas.setPointerCapture(event.pointerId)
      canvas.focus({ preventScroll: true })
    }
    const move = event => {
      if (!pointer || event.pointerId !== pointer.id) return
      look.current.yaw = MathUtils.clamp(look.current.yaw - (event.clientX - pointer.x) * 0.004, -1.15, 1.15)
      look.current.pitch = MathUtils.clamp(look.current.pitch - (event.clientY - pointer.y) * 0.004, -0.65, 0.28)
      pointer.x = event.clientX; pointer.y = event.clientY
    }
    const up = () => { pointer = null }
    const key = event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return
      event.preventDefault()
      if (event.key === 'Home') { look.current.yaw = 0; look.current.pitch = -0.22 }
      else {
        look.current.yaw = MathUtils.clamp(look.current.yaw + (event.key === 'ArrowLeft' ? 0.07 : event.key === 'ArrowRight' ? -0.07 : 0), -1.15, 1.15)
        look.current.pitch = MathUtils.clamp(look.current.pitch + (event.key === 'ArrowUp' ? 0.05 : event.key === 'ArrowDown' ? -0.05 : 0), -0.65, 0.28)
      }
    }
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('lostpointercapture', up); canvas.addEventListener('keydown', key)
    return () => {
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('lostpointercapture', up); canvas.removeEventListener('keydown', key)
    }
  }, [gl, look])
  useFrame((_, delta) => {
    const t = 1 - Math.exp(-15 * delta)
    look.current.actualYaw = MathUtils.lerp(look.current.actualYaw, look.current.yaw, t)
    look.current.actualPitch = MathUtils.lerp(look.current.actualPitch, look.current.pitch, t)
    camera.position.fromArray(EYE_POSITION)
    camera.rotation.set(look.current.actualPitch, look.current.actualYaw, 0, 'YXZ')
  }, -2)
  return null
}
