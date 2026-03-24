import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // First user = owner, subsequent users need invite or get "user" role
    const result = await prisma.$transaction(async (tx) => {
      const userCount = await tx.user.count();

      if (userCount === 0) {
        // First user becomes owner
        return tx.user.create({
          data: {
            email,
            name: name || email,
            role: "owner",
            passwordHash,
          },
        });
      }

      // Check guest invites for subsequent users
      const invite = await tx.guestInvite.findUnique({
        where: { email },
      });

      const role = invite ? "guest" : "user";

      return tx.user.create({
        data: {
          email,
          name: name || email,
          role,
          passwordHash,
        },
      });
    }, { isolationLevel: "Serializable" });

    return NextResponse.json(
      { message: "User created successfully", role: result.role },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
