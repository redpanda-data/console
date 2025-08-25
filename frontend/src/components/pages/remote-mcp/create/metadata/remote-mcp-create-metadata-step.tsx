import { Plus, Trash2 } from 'lucide-react';
import { useCheckMCPServerNameUniqueness } from '../../../../../react-query/api/remote-mcp';
import { Button } from '../../../../redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../redpanda-ui/components/card';
import { Input } from '../../../../redpanda-ui/components/input';
import { Label } from '../../../../redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../redpanda-ui/components/select';
import { Textarea } from '../../../../redpanda-ui/components/textarea';

interface MetadataStepProps {
  displayName: string;
  setDisplayName: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  tags: Array<{ key: string; value: string }>;
  setTags: (tags: Array<{ key: string; value: string }>) => void;
  resources: string;
  setResources: (value: string) => void;
}

export const RemoteMCPCreateMetadataStep = ({
  displayName,
  setDisplayName,
  description,
  setDescription,
  tags,
  setTags,
  resources,
  setResources,
}: MetadataStepProps) => {
  const { checkNameUniqueness, isLoading: isCheckingUniqueness } = useCheckMCPServerNameUniqueness();

  const isNameDuplicate = displayName.trim() !== '' && !isCheckingUniqueness && !checkNameUniqueness(displayName);

  const addTag = () => {
    setTags([...tags, { key: '', value: '' }]);
  };

  const removeTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  const updateTag = (index: number, field: 'key' | 'value', value: string) => {
    const updatedTags = tags.map((tag, i) => (i === index ? { ...tag, [field]: value } : tag));
    setTags(updatedTags);
  };

  return (
    <Card className="max-w-full px-8 py-6">
      <CardHeader>
        <CardTitle>Server Metadata</CardTitle>
        <CardDescription>Configure the basic information and resources for your MCP server.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name *</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="My MCP Server"
            required
            className={isNameDuplicate ? 'border-destructive focus:border-destructive' : ''}
          />
          {isNameDuplicate && (
            <p className="text-sm text-destructive">
              A server with this name already exists. Please choose a different name.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this MCP server does..."
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label>Tags</Label>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground pb-2">Key-value pairs for organizing and categorizing</p>
            {tags.map((tag, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  placeholder="Key"
                  value={tag.key}
                  className="flex-1"
                  onChange={(e) => updateTag(index, 'key', e.target.value)}
                />
                <Input
                  placeholder="Value"
                  value={tag.value}
                  className="flex-1"
                  onChange={(e) => updateTag(index, 'value', e.target.value)}
                />
                <Button variant="outline" size="sm" onClick={() => removeTag(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addTag}>
              <Plus className="h-4 w-4 mr-2" />
              Add Tag
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="resources">Resources</Label>
          <Select value={resources} onValueChange={setResources}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">Small (0.5 CPU, 1GB RAM)</SelectItem>
              <SelectItem value="medium">Medium (1 CPU, 2GB RAM)</SelectItem>
              <SelectItem value="large">Large (2 CPU, 4GB RAM)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
};
