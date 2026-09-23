import {GENRES, type Genre} from '../../../shared/modes/buzzer-board/index.ts';
import type {QuestionExtraFieldsProps} from '../types.ts';

export const QuestionExtraFields = ({value, onChange}: QuestionExtraFieldsProps) => {
	const currentGenre = (value.genre as Genre) || GENRES[0];
	return (
		<div>
			<label style={{display: 'block', marginBottom: '4px', fontWeight: 700}}>
				ジャンル
				<select
					style={{marginLeft: '8px', padding: '4px 8px', borderRadius: '4px'}}
					value={currentGenre}
					onChange={(e) => onChange({...value, genre: e.target.value as Genre})}
				>
					{GENRES.map((g) => (
						<option key={g} value={g}>
							{g}
						</option>
					))}
				</select>
			</label>
		</div>
	);
};
