import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const isAuthenticated = !!req.nextauth.token;

    // Authenticated users hitting / or /auth/* get sent to the dashboard
    if (isAuthenticated && (pathname === '/' || pathname.startsWith('/auth'))) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Return true = allow; return false = redirect to signIn page
      authorized({ token, req }) {
        const { pathname } = req.nextUrl;

        // Public paths — always allow
        if (
          pathname === '/' ||
          pathname.startsWith('/auth') ||
          pathname.startsWith('/api/auth')
        ) {
          return true;
        }

        // Everything else requires a valid session token
        return !!token;
      },
    },
    pages: { signIn: '/auth/login' },
  },
);

export const config = {
  // Run middleware on all routes except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
