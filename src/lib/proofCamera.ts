import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

/**
 * 인증 사진 촬영 — 즉석성이 핵심이라 갤러리 선택은 제공하지 않는다.
 * 네이티브: 카메라 앱 직행 (source: Camera), 웹: capture 속성 input.
 * 반환 null = 사용자가 촬영을 취소함.
 */
const MAX_DIM = 1080;
const JPEG_QUALITY = 0.85;

export async function captureProofPhoto(): Promise<Blob | null> {
  const dataUrl = Capacitor.isNativePlatform()
    ? await captureNative()
    : await captureWeb();
  if (!dataUrl) return null;
  return resizeToJpeg(dataUrl);
}

async function captureNative(): Promise<string | null> {
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera, // 갤러리 차단 — 무보정 즉석 촬영만
      resultType: CameraResultType.DataUrl,
      quality: 90,
      correctOrientation: true,
      saveToGallery: false,
    });
    return photo.dataUrl ?? null;
  } catch {
    return null; // 사용자 취소 포함
  }
}

function captureWeb(): Promise<string | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // 모바일 브라우저는 카메라 직행, 데스크톱은 파일 선택 폴백
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** 긴 변 1080px로 줄인 JPEG — 업로드 용량과 Storage 비용을 잡는다 */
function resizeToJpeg(dataUrl: string): Promise<Blob | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', JPEG_QUALITY);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
