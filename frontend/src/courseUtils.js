const CATEGORY_RULES = [
  {
    name: 'Cloud & DevOps',
    code: 'OPS',
    keywords: ['aws', 'cloud', 'docker', 'kubernetes', 'k8s', 'terraform', 'devops', 'ci/cd', 'linux', 'bash', 'shell', 'deploy', 'infra'],
  },
  {
    name: 'Frontend & Web',
    code: 'WEB',
    keywords: ['react', 'vue', 'angular', 'css', 'html', 'dom', 'frontend', 'tailwind', 'next', 'web', 'javascript', 'typescript', 'js', 'ui'],
  },
  {
    name: 'Backend & Systems',
    code: 'SYS',
    keywords: ['node', 'express', 'api', 'rest', 'graphql', 'go', 'golang', 'rust', 'java', 'c++', 'c#', 'backend', 'microservice', 'system', 'sql', 'database', 'postgres', 'redis'],
  },
  {
    name: 'Python & Data',
    code: 'PY',
    keywords: ['python', 'django', 'flask', 'fastapi', 'pandas', 'numpy', 'data', 'machine learning', 'ml', 'analytics', 'pytorch'],
  },
  {
    name: 'Security & Networking',
    code: 'SEC',
    keywords: ['security', 'network', 'cyber', 'auth', 'oauth', 'jwt', 'pentest', 'encryption', 'tcp', 'http', 'websocket'],
  },
];

export function inferCourseCategory(course) {
  const haystack = `${course?.Title ?? ''} ${course?.Description ?? ''}`.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => haystack.includes(kw))) {
      return { name: rule.name, code: rule.code };
    }
  }
  const words = (course?.Title ?? 'Course')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const code = words.length >= 2
    ? `${words[0][0]}${words[1][0]}`.toUpperCase()
    : (words[0]?.slice(0, 3) || 'DEV').toUpperCase();
  return { name: 'Software Engineering', code };
}

