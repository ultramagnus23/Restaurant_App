"use client" // <--- 1. THIS IS REQUIRED AT THE TOP

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react"

export default function UploadPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    const formData = new FormData(e.currentTarget)
    const file = formData.get("file") as File

    if (!file) {
      setError("Please select a file")
      setLoading(false)
      return
    }

    try {
      const uploadFormData = new FormData()
      uploadFormData.append("file", file)

      // 2. CHANGED ENDPOINT: /api/ingest -> /api/upload
      const res = await fetch("/api/upload", { 
        method: "POST",
        body: uploadFormData,
      })

      const result = await res.json()
      
      if (res.ok && result.success) { // logic matches the API response structure I gave you
        setSuccess(true)
        // Trigger storage event to notify dashboard
        window.localStorage.setItem("dataUploaded", Date.now().toString())
        
        setError(null)
        
        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
          router.push("/")
          router.refresh() // standard Next.js refresh is usually sufficient
        }, 2000)
      } else {
        setError(result.error || result.message || "Upload failed. Please check your CSV format.")
      }
    } catch (err) {
      console.error(err)
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Upload POS CSV Data</CardTitle>
          <CardDescription>
            Upload your POS transaction data in CSV format. The file should include columns:
            posOrderId, order_time, channel, menu_item, category, quantity, price
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label htmlFor="file" className="block text-sm font-medium mb-2">
                CSV File
              </label>
              <input
                id="file"
                type="file"
                name="file"
                accept=".csv"
                required
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-md">
                <CheckCircle2 className="h-4 w-4" />
                <div className="text-sm">
                  <div className="font-medium">CSV uploaded successfully!</div>
                  <div className="text-xs mt-1">Redirecting to dashboard...</div>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={loading || success}
                className="gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Upload
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/")}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}