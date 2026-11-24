import { Column, Entity, PrimaryColumn } from "typeorm";

/** One interface string in one added language. English and Amharic live in @db/shared-schemas, not here. */
@Entity("translations")
export class TranslationEntity {
  @PrimaryColumn()
  lang!: string;

  @PrimaryColumn()
  key!: string;

  @Column({ type: "text" })
  text!: string;

  /** "machine" until a speaker fixes or confirms it, then "person". */
  @Column({ default: "machine" })
  source!: string;

  /** The English text this was made from, so a changed English string can be translated again. */
  @Column({ type: "text" })
  english!: string;

  @Column()
  updatedAt!: string;
}
