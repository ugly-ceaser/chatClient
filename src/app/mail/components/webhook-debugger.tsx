'use client'
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Webhook } from "lucide-react"
import React from 'react'
import { useLocalStorage } from "usehooks-ts"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

const WebhookDebugger = () => {
    const [accountId, setAccountId] = useLocalStorage('accountId', '')
    const [webhooks, setWebhooks] = React.useState<any[]>([]) // Initialize as empty array
    const [isLoading, setIsLoading] = React.useState(false)

    const [newWebhookUrl, setNewWebhookUrl] = React.useState('')

    // Fetch webhooks
    const fetchWebhooks = async () => {
        setIsLoading(true)
        try {
            const response = await fetch('/api/webhooks/nylas')
            if (!response.ok) {
                throw new Error('Failed to fetch webhooks')
            }
            const data = await response.json()
            if (data.records) {
                setWebhooks(data.records) // Ensure data.records is an array
            } else {
                setWebhooks([]) // Fallback to empty array
            }
        } catch (error) {
            console.error('Error fetching webhooks:', error)
            toast.error('Failed to fetch webhooks')
            setWebhooks([]) // Fallback to empty array
        } finally {
            setIsLoading(false)
        }
    }

    React.useEffect(() => {
        if (accountId) {
            fetchWebhooks()
        }
    }, [accountId])

    // Create a new webhook
    const handleCreateWebhook = async () => {
        if (!newWebhookUrl) {
            toast.error('Please enter a valid webhook URL')
            return
        }

        toast.promise(
            fetch('/api/webhooks/nylas/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ notificationUrl: newWebhookUrl }),
            }).then(() => {
                setNewWebhookUrl('')
                fetchWebhooks() // Refresh the list of webhooks
            }),
            {
                loading: 'Creating webhook...',
                success: 'Webhook created!',
                error: 'Error creating webhook',
            }
        )
    }

    // Delete a webhook
    const handleDeleteWebhook = async (webhookId: string) => {
        toast.promise(
            fetch('/api/webhooks/nylas/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ webhookId }),
            }).then(() => {
                fetchWebhooks() // Refresh the list of webhooks
            }),
            {
                loading: 'Deleting webhook...',
                success: 'Webhook deleted!',
                error: 'Error deleting webhook',
            }
        )
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button>
                    <Webhook className="size-4 mr-1" />
                    Debug Webhooks
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Webhook Debugger</DialogTitle>
                    <DialogDescription>
                        {isLoading ? (
                            <p>Loading webhooks...</p>
                        ) : (
                            <>
                                {webhooks.length === 0 ? (
                                    <p>No webhooks found.</p>
                                ) : (
                                    webhooks.map(record => (
                                        <div key={record.id} className="mb-4 p-4 rounded-md bg-slate-100">
                                            <div className="mb-2">
                                                <span className="font-semibold">Callback URL:</span> {record.callbackUrl}
                                            </div>
                                            <div className="mb-2">
                                                <span className="font-semibold">State:</span> {record.state === 'active' ? (
                                                    <span className="text-green-600">Active</span>
                                                ) : (
                                                    <span className="text-red-600">Inactive</span>
                                                )}
                                            </div>
                                            <div className="mb-2">
                                                <span className="font-semibold">Triggers:</span> {record.triggers.join(', ')}
                                            </div>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => handleDeleteWebhook(record.id)}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    ))
                                )}
                                <div className="mt-4">
                                    <Input
                                        type="text"
                                        placeholder="Enter webhook URL"
                                        value={newWebhookUrl}
                                        onChange={(e) => setNewWebhookUrl(e.target.value)}
                                    />
                                    <Button
                                        className="mt-2"
                                        onClick={handleCreateWebhook}
                                        disabled={!newWebhookUrl}
                                    >
                                        Create Webhook
                                    </Button>
                                </div>
                            </>
                        )}
                    </DialogDescription>
                </DialogHeader>
            </DialogContent>
        </Dialog>
    )
}

export default WebhookDebugger