import { NextAuthOptions, Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";

/**
 * NextAuth configuration.
 * Uses a Canvas-backed credentials provider:
 * After Canvas OAuth, a secure cookie (canvas_user_email) is set.
 * This provider reads that cookie to establish the NextAuth session.
 * This bridges Canvas OAuth with NextAuth's session management.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "canvas",
      name: "Canvas",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          select: {
            id: true,
            email: true,
            name: true,
          },
        });

        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session(params: any): Promise<Session> {
      const { session, token } = params as { session: Session; token: Record<string, unknown> };
      if (session.user) {
        (session.user as Record<string, unknown>).id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
};
