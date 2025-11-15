import Link from 'next/link';
import { ArrowRight, BookOpen, MessageSquare, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="container mx-auto px-4">
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center py-20 text-center space-y-8">
        <div className="space-y-4 max-w-3xl">
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
            AI-Powered Research Assistant
          </h1>
          <p className="text-xl text-muted-foreground">
            Automatically collect papers, chat with them using RAG, and discover
            research trends. Your personal AI research companion.
          </p>
        </div>
        <div className="flex gap-4">
          {user ? (
            <Button asChild size="lg">
              <Link href="/collections">
                View My Collections
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button asChild size="lg">
              <Link href="/login">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="lg">
            <Link href="/discover">Explore Public Collections</Link>
          </Button>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16">
        <div className="grid gap-8 md:grid-cols-3">
          <Card>
            <CardHeader>
              <BookOpen className="h-12 w-12 mb-4 text-primary" />
              <CardTitle>Auto-Collect Papers</CardTitle>
              <CardDescription>
                Search and collect research papers automatically from Semantic
                Scholar. Upload PDFs for paywalled content.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                <li>Filter by year and citations</li>
                <li>Open Access PDF downloads</li>
                <li>Manual PDF upload support</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <MessageSquare className="h-12 w-12 mb-4 text-primary" />
              <CardTitle>Chat with Papers</CardTitle>
              <CardDescription>
                Ask questions and get citation-backed answers using RAG. All
                responses include source references.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                <li>Natural language Q&A</li>
                <li>Citation tracking</li>
                <li>Conversation history</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <TrendingUp className="h-12 w-12 mb-4 text-primary" />
              <CardTitle>Discover Insights</CardTitle>
              <CardDescription>
                Automatically generated insights about research trends, top
                papers, and knowledge gaps.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                <li>Research trend analysis</li>
                <li>Top cited papers</li>
                <li>Knowledge gap detection</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      {!user && (
        <section className="py-16 text-center">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-3xl">
                Ready to supercharge your research?
              </CardTitle>
              <CardDescription className="text-base">
                Sign in to create your first collection and start chatting with
                research papers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="lg">
                <Link href="/login">
                  Sign In to Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
