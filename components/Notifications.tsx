import { useEffect, useState } from 'react'

interface Notification {
  id: number
  message: string
  type: 'error' | 'success' | 'info'
}

export function Notifications({ 
  notifications,
  onDismiss
}: { 
  notifications: Notification[]
  onDismiss: (id: number) => void
}) {
  return (
    <div className="fixed bottom-4 right-4 space-y-2">
      {notifications.map((notification) => (
        <div 
          key={`${notification.id}-${notification.message}`} // More unique key
          className={`p-4 rounded-lg shadow-lg max-w-sm ${
            notification.type === 'error' ? 'bg-red-500 text-white' :
            notification.type === 'success' ? 'bg-green-500 text-white' :
            'bg-blue-500 text-white'
          }`}
        >
          <div className="flex justify-between items-start">
            <p>{notification.message}</p>
            <button 
              onClick={() => onDismiss(notification.id)}
              className="ml-4 text-white hover:text-gray-200"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])

  const addNotification = (message: string, type: 'error' | 'success' | 'info' = 'info') => {
    const id = Date.now()
    setNotifications(prev => [...prev, { id, message, type }])

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      dismissNotification(id)
    }, 5000)
  }

  const dismissNotification = (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  return {
    notifications,
    addNotification,
    dismissNotification
  }
}
