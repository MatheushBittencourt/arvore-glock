const CLOUD  = import.meta.env.VITE_CLOUDINARY_CLOUD
const PRESET = import.meta.env.VITE_CLOUDINARY_PRESET

export async function uploadToCloudinary(file, onProgress) {
  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', PRESET)
  form.append('folder', 'familia-glock')

  // Cloudinary free plan: usar 'image' para imagens, 'raw' para outros (PDF, doc, etc.)
  const resourceType = file.type.startsWith('image/') ? 'image' : 'raw'

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD}/${resourceType}/upload`)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText)
        resolve({
          url:       data.secure_url,
          public_id: data.public_id,
          tamanho:   data.bytes,
          tipo:      data.resource_type + '/' + data.format,
        })
      } else {
        reject(new Error('Erro no upload: ' + xhr.statusText))
      }
    }

    xhr.onerror = () => reject(new Error('Erro de rede no upload'))
    xhr.send(form)
  })
}

export function getCloudinaryDownloadUrl(url) {
  // Força download via fl_attachment
  return url.replace('/upload/', '/upload/fl_attachment/')
}
