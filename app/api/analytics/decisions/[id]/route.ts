import { type NextRequest, NextResponse } from "next/server"

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const { status } = body

    // TODO: Update decision status in your database
    console.log(`[v0] Updating decision ${params.id} to status: ${status}`)

    return NextResponse.json({
      success: true,
      data: { id: params.id, status, updatedAt: new Date().toISOString() },
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
