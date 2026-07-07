import Swal from 'sweetalert2'

export const swal = Swal.mixin({
  customClass: {
    popup: 'podcastery-swal-popup',
    title: 'podcastery-swal-title',
    htmlContainer: 'podcastery-swal-text',
    confirmButton: 'podcastery-swal-confirm',
    cancelButton: 'podcastery-swal-cancel',
  },
  buttonsStyling: false,
})

export const toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2600,
  timerProgressBar: true,
  customClass: {
    popup: 'podcastery-toast',
  },
  didOpen: (el) => {
    el.addEventListener('mouseenter', Swal.stopTimer)
    el.addEventListener('mouseleave', Swal.resumeTimer)
  },
})

export function notifySuccess(title: string) {
  return toast.fire({ icon: 'success', title })
}

export function notifyError(title: string) {
  return toast.fire({ icon: 'error', title })
}

export async function confirmDestructive(options: {
  title: string
  text: string
  confirmText?: string
}) {
  const result = await swal.fire({
    icon: 'warning',
    title: options.title,
    text: options.text,
    showCancelButton: true,
    confirmButtonText: options.confirmText ?? 'ลบเลย',
    cancelButtonText: 'ยกเลิก',
    reverseButtons: true,
    focusCancel: true,
  })
  return result.isConfirmed
}
