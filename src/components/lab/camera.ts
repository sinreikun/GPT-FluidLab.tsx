import {W,H,clamp} from './engine';
export interface Camera {zoom:number;x:number;y:number}
export const defaultCamera=():Camera=>({zoom:1,x:W/2,y:H/2});
export function worldPoint(camera:Camera,x:number,y:number){return {x:camera.x+(x-W/2)/camera.zoom,y:camera.y+(y-H/2)/camera.zoom};}
export function zoomCamera(camera:Camera,factor:number,x=W/2,y=H/2):Camera{
  const anchor=worldPoint(camera,x,y),zoom=clamp(camera.zoom*factor,.5,8);
  return constrainCamera({zoom,x:anchor.x-(x-W/2)/zoom,y:anchor.y-(y-H/2)/zoom});
}
export function constrainCamera(camera:Camera):Camera{
  const halfX=W/(2*camera.zoom),halfY=H/(2*camera.zoom);
  return {...camera,x:camera.zoom<=1?W/2:clamp(camera.x,halfX,W-halfX),y:camera.zoom<=1?H/2:clamp(camera.y,halfY,H-halfY)};
}
