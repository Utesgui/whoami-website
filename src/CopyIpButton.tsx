import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useI18n } from './i18n'

export type CopyIp = (ip: string) => Promise<boolean>

export default function CopyIpButton({ ip, onCopy, label, className = '' }: {
  ip: string; onCopy: CopyIp; label?: string; className?: string;
}) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [pending, setPending] = useState(false)
  useEffect(() => { setCopied(false) }, [ip])
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(timer)
  }, [copied])
  return <button type="button" className={`icon-button copy-ip-button ${copied ? 'is-copied' : ''} ${className}`}
    aria-label={label ?? t('address.copy')} title={copied ? t('toast.copied') : t('address.copy')}
    disabled={pending} onClick={async () => {
      setPending(true)
      setCopied(false)
      const success = await onCopy(ip)
      setCopied(success)
      setPending(false)
    }}>
    {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
  </button>
}
