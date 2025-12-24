import { getProviders, signIn } from 'next-auth/react';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../api/auth/[...nextauth]';
import Head from 'next/head';
import styles from '../../styles/Auth.module.css';

export default function SignIn({ providers }) {
  return (
    <div className={styles.container}>
      <Head>
        <title>Sign In - ShareCloud</title>
        <meta name="description" content="Sign in to ShareCloud" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.logo}>
            <h1>☁️ ShareCloud</h1>
            <p>Your files, powered by Azure</p>
          </div>

          <div className={styles.content}>
            <h2>Welcome Back</h2>
            <p className={styles.subtitle}>Sign in to access your files</p>

            <div className={styles.providers}>
              {providers &&
                Object.values(providers).map((provider) => (
                  <button
                    key={provider.name}
                    onClick={() => signIn(provider.id, { callbackUrl: '/' })}
                    className={styles.signInButton}
                  >
                    <svg className={styles.icon} viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M0 10.5C0 4.70101 4.70101 0 10.5 0C16.299 0 21 4.70101 21 10.5C21 16.299 16.299 21 10.5 21C4.70101 21 0 16.299 0 10.5Z" fill="#F25022"/>
                      <path d="M10.5 0C16.299 0 21 4.70101 21 10.5H10.5V0Z" fill="#7FBA00"/>
                      <path d="M0 10.5C0 16.299 4.70101 21 10.5 21V10.5H0Z" fill="#00A4EF"/>
                      <path d="M10.5 10.5H21C21 4.70101 16.299 0 10.5 0V10.5Z" fill="#FFB900"/>
                    </svg>
                    Sign in with Microsoft
                  </button>
                ))}
            </div>

            <div className={styles.features}>
              <div className={styles.feature}>
                <span className={styles.featureIcon}>🔒</span>
                <div>
                  <h3>Secure</h3>
                  <p>Enterprise-grade security with Azure AD</p>
                </div>
              </div>
              <div className={styles.feature}>
                <span className={styles.featureIcon}>☁️</span>
                <div>
                  <h3>Cloud Storage</h3>
                  <p>Store and access files from anywhere</p>
                </div>
              </div>
              <div className={styles.feature}>
                <span className={styles.featureIcon}>🗑️</span>
                <div>
                  <h3>Trash Protection</h3>
                  <p>30-day recovery for deleted files</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <p>Powered by Microsoft Azure</p>
      </footer>
    </div>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);

  // If already signed in, redirect to home
  if (session) {
    return {
      redirect: {
        destination: '/',
        permanent: false,
      },
    };
  }

  const providers = await getProviders();

  return {
    props: { providers: providers ?? [] },
  };
}
