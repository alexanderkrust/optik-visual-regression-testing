import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { Project, CreateProjectDto } from '@optik/shared';

type ProjectRow = { id: string; name: string; slug: string; createdAt: Date };

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Project[]> {
    const rows = await this.prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
    });
    console.log(rows);
    return rows.map(toDto);
  }

  async findBySlug(slug: string): Promise<Project> {
    const row = await this.prisma.project.findUnique({ where: { slug } });
    if (!row) throw new NotFoundException(`Project "${slug}" not found`);
    return toDto(row);
  }

  async create(dto: CreateProjectDto): Promise<Project> {
    try {
      const row = await this.prisma.project.create({
        data: { name: dto.name, slug: dto.slug },
      });
      return toDto(row);
    } catch (e: any) {
      if (e?.code === 'P2002')
        throw new ConflictException(`Slug "${dto.slug}" already exists`);
      throw e;
    }
  }
}

function toDto(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    createdAt: r.createdAt.toISOString(),
  };
}
